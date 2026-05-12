// scripts/__tests__/provision-cron.test.mjs
//
// Unit tests for `ops/openclaw/provision-cron.mjs` (Stage 5d).
//
// Coverage:
//   - buildMorningDigestJob: canonical shape + required arg validation.
//   - mergeMorningDigestJob: create / preserve unrelated / idempotent
//     update keeping id+createdAtMs+state / version fallback / null
//     store handling.
//   - loadCronStore: missing file / empty file / valid JSON / malformed
//     JSON refusal.
//   - saveCronStore: parent-dir auto-create + JSON roundtrip.
//   - resolveJobsJsonPath: home-dir override.
//   - golden snapshot: byte-exact JSON shape of the canonical job
//     (drift-gate; matches the openclaw 5.7 `CronJob` runtime schema).
//
// Run with: node --test scripts/__tests__/provision-cron.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildMorningDigestJob,
  mergeMorningDigestJob,
  loadCronStore,
  saveCronStore,
  resolveJobsJsonPath,
  MORNING_DIGEST_JOB_ID,
  MORNING_DIGEST_JOB_NAME,
  MORNING_DIGEST_CRON_EXPR,
  MORNING_DIGEST_TIMEZONE,
  MORNING_DIGEST_MESSAGE,
} from "../../ops/openclaw/provision-cron.mjs";

const FAKE_TG = "123456789";
const FAKE_NOW = 1_700_000_000_000;

// ── buildMorningDigestJob ────────────────────────────────────────────────────

describe("buildMorningDigestJob", () => {
  it("returns a job with the canonical morning-digest shape", () => {
    const j = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    assert.equal(j.id, MORNING_DIGEST_JOB_ID);
    assert.equal(j.name, MORNING_DIGEST_JOB_NAME);
    assert.equal(j.enabled, true);
    assert.equal(j.createdAtMs, FAKE_NOW);
    assert.equal(j.updatedAtMs, FAKE_NOW);
    assert.equal(j.sessionTarget, "isolated");
    assert.equal(j.wakeMode, "now");
    assert.deepEqual(j.schedule, {
      kind: "cron",
      expr: MORNING_DIGEST_CRON_EXPR,
      tz: MORNING_DIGEST_TIMEZONE,
    });
    assert.deepEqual(j.payload, {
      kind: "agentTurn",
      message: MORNING_DIGEST_MESSAGE,
    });
    assert.deepEqual(j.delivery, {
      mode: "announce",
      channel: "telegram",
      to: FAKE_TG,
      bestEffort: true,
    });
    assert.deepEqual(j.state, {});
    assert.equal(typeof j.description, "string");
    assert.ok(j.description.length > 0);
  });

  it("throws when founderTgUserId is missing", () => {
    assert.throws(
      () => buildMorningDigestJob({}),
      /founderTgUserId is required/,
    );
  });

  it("throws when founderTgUserId is empty string", () => {
    assert.throws(
      () => buildMorningDigestJob({ founderTgUserId: "" }),
      /founderTgUserId is required/,
    );
  });

  it("throws when founderTgUserId is non-string", () => {
    assert.throws(
      () => buildMorningDigestJob({ founderTgUserId: 123 }),
      /founderTgUserId is required/,
    );
  });

  it("matches the golden JSON snapshot (drift-gate)", () => {
    const j = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    // Drift-gate: byte-exact match against the canonical morning-digest
    // shape. If `openclaw@2026.5.x` ever evolves the `CronJob` schema in
    // a way that requires us to add/rename a field, this test will fail
    // and force a deliberate update — including bumping the stage tracker.
    const expected = {
      id: "sergeant-morning-digest",
      name: "morning-digest",
      description: j.description,
      enabled: true,
      createdAtMs: FAKE_NOW,
      updatedAtMs: FAKE_NOW,
      schedule: { kind: "cron", expr: "0 9 * * *", tz: "Europe/Kyiv" },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "/digest day" },
      delivery: {
        mode: "announce",
        channel: "telegram",
        to: FAKE_TG,
        bestEffort: true,
      },
      state: {},
    };
    assert.deepEqual(j, expected);
  });
});

// ── mergeMorningDigestJob ────────────────────────────────────────────────────

describe("mergeMorningDigestJob", () => {
  it("creates a fresh store with the job appended", () => {
    const job = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    const result = mergeMorningDigestJob({ version: 1, jobs: [] }, job);
    assert.equal(result.version, 1);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].name, MORNING_DIGEST_JOB_NAME);
  });

  it("preserves unrelated jobs in the store", () => {
    const other = {
      id: "other-1",
      name: "weekly-report",
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
      schedule: { kind: "cron", expr: "0 8 * * MON", tz: "UTC" },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "weekly report" },
    };
    const job = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    const result = mergeMorningDigestJob({ version: 1, jobs: [other] }, job);
    assert.equal(result.jobs.length, 2);
    assert.deepEqual(result.jobs[0], other);
    assert.equal(result.jobs[1].name, MORNING_DIGEST_JOB_NAME);
  });

  it("upserts existing morning-digest while preserving id, createdAtMs, and state", () => {
    const oldCreated = FAKE_NOW - 86_400_000 * 7;
    const oldUpdated = FAKE_NOW - 86_400_000;
    const oldJob = {
      ...buildMorningDigestJob({
        founderTgUserId: "old-tg-id",
        now: oldUpdated,
        createdAtMs: oldCreated,
      }),
      id: "preexisting-id-xyz",
      state: { lastRunAtMs: FAKE_NOW - 3_600_000, lastRunStatus: "ok" },
    };
    const newJob = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    const result = mergeMorningDigestJob(
      { version: 1, jobs: [oldJob] },
      newJob,
    );
    assert.equal(result.jobs.length, 1);
    const merged = result.jobs[0];
    assert.equal(merged.id, "preexisting-id-xyz");
    assert.equal(merged.createdAtMs, oldCreated);
    assert.equal(merged.updatedAtMs, FAKE_NOW);
    assert.equal(merged.delivery.to, FAKE_TG);
    assert.equal(merged.state.lastRunAtMs, FAKE_NOW - 3_600_000);
    assert.equal(merged.state.lastRunStatus, "ok");
  });

  it("falls back to version=1 when the store has no version field", () => {
    const result = mergeMorningDigestJob(
      { jobs: [] },
      buildMorningDigestJob({ founderTgUserId: FAKE_TG }),
    );
    assert.equal(result.version, 1);
  });

  it("handles a null store gracefully", () => {
    const result = mergeMorningDigestJob(
      null,
      buildMorningDigestJob({ founderTgUserId: FAKE_TG }),
    );
    assert.equal(result.version, 1);
    assert.equal(result.jobs.length, 1);
  });

  it("handles an undefined store gracefully", () => {
    const result = mergeMorningDigestJob(
      undefined,
      buildMorningDigestJob({ founderTgUserId: FAKE_TG }),
    );
    assert.equal(result.version, 1);
    assert.equal(result.jobs.length, 1);
  });
});

// ── loadCronStore ────────────────────────────────────────────────────────────

describe("loadCronStore", () => {
  it("returns an empty store when the file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "provision-cron-"));
    const path = join(dir, "jobs.json");
    assert.deepEqual(loadCronStore(path), { version: 1, jobs: [] });
  });

  it("returns an empty store for an empty file", () => {
    const dir = mkdtempSync(join(tmpdir(), "provision-cron-"));
    const path = join(dir, "jobs.json");
    writeFileSync(path, "");
    assert.deepEqual(loadCronStore(path), { version: 1, jobs: [] });
  });

  it("loads a valid JSON file as-is", () => {
    const dir = mkdtempSync(join(tmpdir(), "provision-cron-"));
    const path = join(dir, "jobs.json");
    writeFileSync(path, '{"version": 1, "jobs": []}');
    assert.deepEqual(loadCronStore(path), { version: 1, jobs: [] });
  });

  it("throws with a clear message when the JSON is malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "provision-cron-"));
    const path = join(dir, "jobs.json");
    writeFileSync(path, "{ not json }");
    assert.throws(() => loadCronStore(path), /not valid JSON/);
  });
});

// ── saveCronStore roundtrip ──────────────────────────────────────────────────

describe("saveCronStore", () => {
  it("creates parent directories and writes the store", () => {
    const dir = mkdtempSync(join(tmpdir(), "provision-cron-"));
    const path = join(dir, "nested", "cron", "jobs.json");
    const job = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    const store = { version: 1, jobs: [job] };
    saveCronStore(path, store);
    assert.equal(existsSync(path), true);
    assert.deepEqual(loadCronStore(path), store);
  });

  it("end-to-end: builds, merges into an empty store, writes, and reloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "provision-cron-"));
    const path = join(dir, "jobs.json");
    const job = buildMorningDigestJob({
      founderTgUserId: FAKE_TG,
      now: FAKE_NOW,
    });
    const merged = mergeMorningDigestJob(loadCronStore(path), job);
    saveCronStore(path, merged);
    const reloaded = loadCronStore(path);
    assert.equal(reloaded.jobs.length, 1);
    assert.equal(reloaded.jobs[0].name, MORNING_DIGEST_JOB_NAME);
    assert.equal(reloaded.jobs[0].schedule.expr, MORNING_DIGEST_CRON_EXPR);
  });
});

// ── resolveJobsJsonPath ──────────────────────────────────────────────────────

describe("resolveJobsJsonPath", () => {
  it("returns ~/.openclaw/cron/jobs.json under the supplied home dir", () => {
    const path = resolveJobsJsonPath("/tmp/fake-home");
    assert.equal(path, "/tmp/fake-home/.openclaw/cron/jobs.json");
  });
});
