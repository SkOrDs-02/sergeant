/**
 * Integration tests for the nutrition backup-upload / backup-download
 * handlers (PR-5, Stage 2; re-pointed to Postgres by the pre-beta
 * schema-debt audit, 2026-08-04 — migration 114 `nutrition_backups`).
 *
 * The backup handlers used to be filesystem-only (`.data/nutrition-backup-
 * <key>.json` on the container's ephemeral filesystem — wiped on every
 * Coolify redeploy). They now write through to the `nutrition_backups`
 * table (`user_id, key` PK, `payload` JSONB), so this suite needs a real
 * Postgres (Testcontainers) rather than a temp directory.
 *
 * Tests:
 *   1. upload as user A → download as user A returns the original blob.
 *   2. user B cannot download user A's backup — the HMAC storage key is
 *      bound to userId, so different userId → different `key` → row not
 *      found → NotFoundError (status 404).
 *   3. re-upload (same user + token) upserts in place rather than erroring.
 *
 * `nutrition_backups.user_id` has `ON DELETE CASCADE REFERENCES
 * "user"(id)` (migration 114) — unlike the old filesystem path, every
 * caller now needs a REAL `"user"` row for the INSERT to succeed, so each
 * test seeds one via `seedIntegrationUser()` first.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import type pg from "pg";
import {
  applyIntegrationEnv,
  bootIntegrationHarness,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";

// Dynamic import — env.ts reads process.env at module load time via parseEnv();
// applyIntegrationEnv() must run first so NUTRITION_BACKUP_KEY_SECRET is set.
let uploadHandler: typeof import("../modules/nutrition/backup-upload.js").default;
let downloadHandler: typeof import("../modules/nutrition/backup-download.js").default;
let pool: pg.Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

// 48 hex chars — long enough to be an authentic-looking secret in logs.
const TEST_SECRET = "integration-test-backup-key-secret-48hex-abcdef12";

// ── fakes ───────────────────────────────────────────────────────────────────

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

function makeReq(userId: string, body: unknown = {}, xToken?: string): Request {
  return {
    user: { id: userId },
    headers: xToken ? { "x-token": xToken } : {},
    body,
  } as unknown as Request;
}

// ── lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    // Set env BEFORE importing handlers so env.ts.parseEnv() sees the secret.
    applyIntegrationEnv({ NUTRITION_BACKUP_KEY_SECRET: TEST_SECRET });
    const harness = await bootIntegrationHarness({ app: false });
    pool = harness.pool;
    dockerAvailable = true;

    ({ default: uploadHandler } =
      await import("../modules/nutrition/backup-upload.js"));
    ({ default: downloadHandler } =
      await import("../modules/nutrition/backup-download.js"));
  } catch (e) {
    if (process.env["CI"]) throw e;
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[nutrition-backup integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

// ── tests ────────────────────────────────────────────────────────────────────

describe("nutrition backup upload → download (integration)", () => {
  it(
    "upload as user A then download as user A returns the original blob",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      const userId = "backup-integ-user-a";
      await seedIntegrationUser(pool, userId);
      const blob = { meals: [{ name: "Вівсянка", kcal: 300 }], version: "1" };

      // 1. Upload.
      const uploadRes = makeRes();
      await uploadHandler(makeReq(userId, { blob }, "tok-a"), uploadRes);
      const uploadBody = uploadRes.body as { ok: boolean; savedAt: number };

      expect(uploadRes.statusCode).toBe(200);
      expect(uploadBody.ok).toBe(true);
      expect(typeof uploadBody.savedAt).toBe("number");

      // 2. Download with same userId + same x-token → same HMAC key → same row.
      const downloadRes = makeRes();
      await downloadHandler(makeReq(userId, {}, "tok-a"), downloadRes);
      const downloadBody = downloadRes.body as {
        ok: boolean;
        blob: Record<string, unknown>;
      };

      expect(downloadRes.statusCode).toBe(200);
      expect(downloadBody.ok).toBe(true);
      expect(downloadBody.blob).toEqual(blob);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "user B cannot download user A's backup — different HMAC key → NotFoundError",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      const userA = "backup-integ-user-a2";
      const userB = "backup-integ-user-b2";
      await seedIntegrationUser(pool, userA);
      await seedIntegrationUser(pool, userB);
      const blob = { secret: "only for A" };

      // Upload as user A.
      const uploadRes = makeRes();
      await uploadHandler(makeReq(userA, { blob }, "tok-shared"), uploadRes);
      expect(uploadRes.statusCode).toBe(200);

      // Download as user B using the same x-token.
      // HMAC(userB, "tok-shared", secret) ≠ HMAC(userA, "tok-shared", secret)
      // → different `key` → row not found → NotFoundError thrown by handler.
      await expect(
        downloadHandler(makeReq(userB, {}, "tok-shared"), makeRes()),
      ).rejects.toMatchObject({ status: 404, name: "NotFoundError" });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "re-upload with the same user/token upserts in place (one row, latest payload wins)",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      const userId = "backup-integ-user-c";
      await seedIntegrationUser(pool, userId);

      await uploadHandler(
        makeReq(userId, { blob: { version: "1" } }, "tok-c"),
        makeRes(),
      );
      await uploadHandler(
        makeReq(userId, { blob: { version: "2" } }, "tok-c"),
        makeRes(),
      );

      const { rows } = await pool.query<{ payload: { version: string } }>(
        `SELECT payload FROM nutrition_backups WHERE user_id = $1`,
        [userId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload).toEqual({ version: "2" });

      const downloadRes = makeRes();
      await downloadHandler(makeReq(userId, {}, "tok-c"), downloadRes);
      expect((downloadRes.body as { blob: unknown }).blob).toEqual({
        version: "2",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
