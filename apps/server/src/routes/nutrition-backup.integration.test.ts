/**
 * Integration tests for the nutrition backup-upload / backup-download
 * handlers (PR-5, Stage 2).
 *
 * The backup handlers are filesystem-only — they perform no SQL queries.
 * We call them directly with a synthetic `req.user` (same pattern as
 * syncV2.integration.test.ts) and a temporary NUTRITION_BACKUP_KEY_SECRET.
 *
 * Tests:
 *   1. upload as user A → download as user A returns the original blob.
 *   2. user B cannot download user A's backup — the HMAC storage key is
 *      bound to userId, so different userId → different file path → ENOENT
 *      → NotFoundError (status 404).
 *
 * `applyIntegrationEnv` and `INTEGRATION_TIMEOUT_MS` are imported from the
 * shared harness for consistency; no Postgres container is started because
 * these handlers do not touch the database.
 *
 * The dynamic imports of upload/download handlers must happen AFTER
 * applyIntegrationEnv sets NUTRITION_BACKUP_KEY_SECRET so that env.ts
 * captures the test secret when it parses process.env on first load.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import {
  applyIntegrationEnv,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";

// Dynamic import — env.ts reads process.env at module load time via parseEnv();
// applyIntegrationEnv() must run first so NUTRITION_BACKUP_KEY_SECRET is set.
let uploadHandler: typeof import("../modules/nutrition/backup-upload.js").default;
let downloadHandler: typeof import("../modules/nutrition/backup-download.js").default;

// Matches the `.data` dir the handlers compute at runtime via process.cwd().
const DATA_DIR = path.join(process.cwd(), ".data");

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
  // Set env BEFORE importing handlers so env.ts.parseEnv() sees the secret.
  applyIntegrationEnv({ NUTRITION_BACKUP_KEY_SECRET: TEST_SECRET });

  ({ default: uploadHandler } =
    await import("../modules/nutrition/backup-upload.js"));
  ({ default: downloadHandler } =
    await import("../modules/nutrition/backup-download.js"));

  // Ensure the target directory exists (handlers create it, but mkdir is
  // idempotent).
  await fs.mkdir(DATA_DIR, { recursive: true });
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  // Remove backup files written by this test suite.
  try {
    const files = await fs.readdir(DATA_DIR);
    await Promise.all(
      files
        .filter((f) => f.startsWith("nutrition-backup-") && f.endsWith(".json"))
        .map((f) => fs.unlink(path.join(DATA_DIR, f)).catch(() => {})),
    );
  } catch {
    // DATA_DIR might not exist if all tests were skipped; ignore.
  }
}, INTEGRATION_TIMEOUT_MS);

// ── tests ────────────────────────────────────────────────────────────────────

describe("nutrition backup upload → download (integration)", () => {
  it(
    "upload as user A then download as user A returns the original blob",
    async () => {
      const userId = "backup-integ-user-a";
      const blob = { meals: [{ name: "Вівсянка", kcal: 300 }], version: "1" };

      // 1. Upload.
      const uploadRes = makeRes();
      await uploadHandler(makeReq(userId, { blob }, "tok-a"), uploadRes);
      const uploadBody = uploadRes.body as { ok: boolean; savedAt: number };

      expect(uploadRes.statusCode).toBe(200);
      expect(uploadBody.ok).toBe(true);
      expect(typeof uploadBody.savedAt).toBe("number");

      // 2. Download with same userId + same x-token → same HMAC key → same file.
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
    async () => {
      const userA = "backup-integ-user-a2";
      const userB = "backup-integ-user-b2";
      const blob = { secret: "only for A" };

      // Upload as user A.
      const uploadRes = makeRes();
      await uploadHandler(makeReq(userA, { blob }, "tok-shared"), uploadRes);
      expect(uploadRes.statusCode).toBe(200);

      // Download as user B using the same x-token.
      // HMAC(userB, "tok-shared", secret) ≠ HMAC(userA, "tok-shared", secret)
      // → different file path → ENOENT → NotFoundError thrown by handler.
      await expect(
        downloadHandler(makeReq(userB, {}, "tok-shared"), makeRes()),
      ).rejects.toMatchObject({ status: 404, name: "NotFoundError" });
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
