/**
 * End-to-end coverage of the H9 transcribe USD-cap pipeline. PR 3.3 of
 * initiative
 * `docs/initiatives/0011-foundation-adoption-and-process-discipline.md`
 * Phase 3.
 *
 * The H9 hardening card (`docs/security/hardening/H9-transcribe-usd-cap.md`)
 * defends `/api/transcribe` against runaway Whisper spend — a single
 * compromised user (or a stolen Bearer cookie) could otherwise push
 * unlimited 10 MB clips to Groq for $0.04 a piece, draining a four-figure
 * monthly budget in hours. Defence is two-layer:
 *
 *   1. **Pre-charge** (`assertTranscribeUsdCap`): before the Groq call, sum
 *      the user's already-spent micros for today and reject with **402** if
 *      `spent + estimate > cap_micros`. The 402 response body uses
 *      `code: "TRANSCRIBE_USD_CAP"` — frontend matches on the code, not the
 *      Ukrainian message string, so localisation can change freely.
 *   2. **Post-success** (`recordTranscribeUsdSpend`): only after a 2xx Groq
 *      reply, UPSERT `(subject_key, usage_day, bucket)` with the cost.
 *      Failed Groq calls (5xx) do **not** charge the user — symmetric with
 *      Groq's own billing model.
 *
 * Earlier coverage was unit-level only (`usdCap.test.ts` mocks `pool` and
 * the Express plumbing). This e2e exercises the full request path:
 * `app.use(express.raw())` → router middleware chain → handler →
 * pre-charge SELECT → mocked Groq → post-success UPSERT — against a real
 * Postgres (Testcontainers) and a real 5-second WAV body. The
 * `lib/groq.ts → transcribeAudio` call is mocked because hitting real
 * Groq from CI would (a) cost real $0.04 per run and (b) make the test
 * non-deterministic when Groq's quality changes.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import request from "supertest";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import type { Express } from "express";

// vi.mock is hoisted; getSessionUser/transcribeAudio are intercepted on
// every import path (router → middleware → handler) because vitest applies
// the mock to the module record itself.
const { getSessionUserMock, transcribeAudioMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  transcribeAudioMock: vi.fn(),
}));

vi.mock("../../../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../auth.js")>();
  return {
    ...actual,
    getSessionUser: getSessionUserMock,
  };
});

vi.mock("../../../lib/groq.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/groq.js")>();
  return {
    ...actual,
    transcribeAudio: transcribeAudioMock,
  };
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "..", "migrations");
const FIXTURE_PATH = path.resolve(
  __dirname,
  "..",
  "__fixtures__",
  "silence-5s.wav",
);

const TIMEOUT_MS = 240_000;
const TEST_USER_ID = "user_h9_e2e_test";
const MODEL = "whisper-large-v3-turbo";

let container: StartedTestContainer | undefined;
let testPool: pg.Pool | undefined;
let app: Express | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;
let wavFixture: Buffer | undefined;

async function runMigrations(p: pg.Pool): Promise<void> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of sqlFiles) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (!sql) continue;
    await p.query(sql);
  }
}

beforeAll(async () => {
  // Load fixture early so a missing file fails before we waste 30s on a
  // testcontainer boot.
  wavFixture = await fs.readFile(FIXTURE_PATH);
  if (wavFixture.length < 1024) {
    throw new Error(
      `Fixture ${FIXTURE_PATH} too small (${wavFixture.length} bytes); regenerate via scripts in __fixtures__/README.md`,
    );
  }

  try {
    container = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({
        POSTGRES_USER: "hub",
        POSTGRES_PASSWORD: "hub",
        POSTGRES_DB: "hub_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const uri = `postgresql://hub:hub@${host}:${port}/hub_test`;

    process.env["DATABASE_URL"] = uri;
    process.env["BETTER_AUTH_SECRET"] ??= "0".repeat(64);
    // `requireGroqKey()` is in the chain; any non-empty string passes
    // because the actual Groq call is mocked.
    process.env["GROQ_API_KEY"] = "test-groq-key-do-not-use";
    // Default cap is $1.00/day; override at runtime per-test below.
    delete process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"];

    testPool = new pg.Pool({ connectionString: uri, max: 5 });
    await runMigrations(testPool);

    // Insert the test user once so any FK-bound writes resolve. The
    // pre-charge / post-success queries themselves do not FK the user
    // table, but several other parts of `createApp()` set up routes
    // that load lazy schemas that do.
    await testPool.query(
      `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID, `${TEST_USER_ID}@test.local`, "H9 E2E"],
    );

    const { createApp } = await import("../../../app.js");
    app = createApp();
    dockerAvailable = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[transcribe-usd-cap e2e] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (testPool) await testPool.end().catch(() => {});
  if (container) await container.stop().catch(() => {});
}, TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable || !testPool) return;
  // Reset per-day ledger state so each test starts from spent=0.
  await testPool.query(`TRUNCATE ai_usage_daily RESTART IDENTITY CASCADE`);
  getSessionUserMock.mockReset();
  transcribeAudioMock.mockReset();
  // Default: authenticated test user. Individual tests can override.
  getSessionUserMock.mockResolvedValue({
    id: TEST_USER_ID,
    email: `${TEST_USER_ID}@test.local`,
    name: "H9 E2E",
    image: null,
    emailVerified: true,
  });
  // Default: Groq mock returns canned transcription.
  transcribeAudioMock.mockResolvedValue({
    text: "хеллоу ворлд",
    durationSec: 5.0,
  });
  // Default: cap = $1.00/day (the production default).
  delete process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"];
});

describe("H9 e2e — POST /api/transcribe with real WAV fixture", () => {
  it("first call inside cap → 200 + Groq invoked + ai_usage_daily row UPSERTed", async (ctx) => {
    if (!dockerAvailable || !app || !wavFixture || !testPool) return ctx.skip();

    const res = await request(app)
      .post("/api/transcribe")
      .set("Content-Type", "audio/wav")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer test-bearer")
      .send(wavFixture);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text: "хеллоу ворлд",
      durationSec: 5.0,
      model: MODEL,
    });
    expect(transcribeAudioMock).toHaveBeenCalledOnce();

    // Ledger MUST contain exactly one row for this user/day/bucket with
    // the estimated micros for the fixture's audio bytes.
    const { rows } = await testPool.query<{
      subject_key: string;
      bucket: string;
      request_count: string | number;
      usd_micros: string | number;
    }>(
      `SELECT subject_key, bucket, request_count, usd_micros
       FROM ai_usage_daily
       WHERE subject_key = $1`,
      [`u:${TEST_USER_ID}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subject_key).toBe(`u:${TEST_USER_ID}`);
    expect(rows[0]!.bucket).toBe(`transcribe:${MODEL}`);
    expect(Number(rows[0]!.request_count)).toBe(1);
    // Linear estimate: bytes / 10MB * 40_000 micros (Groq Whisper turbo).
    // For a ~156KB WAV the estimate is ~610 micros, but we assert the
    // exact value derived from the fixture size to keep the test stable
    // when the fixture is regenerated.
    const expectedMicros = Math.ceil(
      (wavFixture.length / (10 * 1024 * 1024)) * 40_000,
    );
    expect(Number(rows[0]!.usd_micros)).toBe(expectedMicros);
  });

  it("repeat call that overflows cap → 402 + TRANSCRIBE_USD_CAP code + ledger NOT incremented", async (ctx) => {
    if (!dockerAvailable || !app || !wavFixture || !testPool) return ctx.skip();

    // Pre-seed the ledger with spending equal to the cap to force a
    // deterministic overflow on the next request without depending on
    // the order of two real requests.
    const expectedMicros = Math.ceil(
      (wavFixture.length / (10 * 1024 * 1024)) * 40_000,
    );
    const cap = expectedMicros; // exactly at the cap
    process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"] = String(cap);

    await testPool.query(
      `INSERT INTO ai_usage_daily
         (subject_key, usage_day, bucket, request_count, usd_micros)
       VALUES ($1, (NOW() AT TIME ZONE 'Europe/Kyiv')::date, $2, 1, $3)`,
      [`u:${TEST_USER_ID}`, `transcribe:${MODEL}`, cap],
    );

    const res = await request(app)
      .post("/api/transcribe")
      .set("Content-Type", "audio/wav")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer test-bearer")
      .send(wavFixture);

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: "TRANSCRIBE_USD_CAP",
      cap_usd: cap / 1_000_000,
      spent_usd: cap / 1_000_000,
    });
    // Friendly UA error string for the user toast.
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error).toContain("ліміт");

    // Critically: Groq must NOT have been called when the cap is hit —
    // that is the whole point of pre-charge. If this fails, somebody
    // moved `assertTranscribeUsdCap` after the Groq call and we are
    // paying for blocked requests.
    expect(transcribeAudioMock).not.toHaveBeenCalled();

    // Ledger must reflect the seed only — no second row, no increment.
    const { rows } = await testPool.query<{
      request_count: string | number;
      usd_micros: string | number;
    }>(
      `SELECT request_count, usd_micros
       FROM ai_usage_daily
       WHERE subject_key = $1`,
      [`u:${TEST_USER_ID}`],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.request_count)).toBe(1);
    expect(Number(rows[0]!.usd_micros)).toBe(cap);
  });

  it("Groq 5xx after pre-charge passes → ledger NOT incremented (failed call is free)", async (ctx) => {
    if (!dockerAvailable || !app || !wavFixture || !testPool) return ctx.skip();

    const { GroqTranscribeError } = await import("../../../lib/groq.js");
    transcribeAudioMock.mockRejectedValue(
      new GroqTranscribeError("upstream blew up", 502, "upstream_5xx"),
    );

    const res = await request(app)
      .post("/api/transcribe")
      .set("Content-Type", "audio/wav")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer test-bearer")
      .send(wavFixture);

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      code: "TRANSCRIBE_UPSTREAM_FAILED",
    });
    expect(transcribeAudioMock).toHaveBeenCalledOnce();

    // Symmetric with Groq's own billing: the user is not charged for an
    // upstream failure. Ledger row must NOT exist for this attempt.
    const { rows } = await testPool.query(
      `SELECT 1 FROM ai_usage_daily WHERE subject_key = $1`,
      [`u:${TEST_USER_ID}`],
    );
    expect(rows).toHaveLength(0);
  });

  it("oversized payload (>10MB) → 413 before pre-charge runs", async (ctx) => {
    if (!dockerAvailable || !app || !testPool) return ctx.skip();

    // Build an ~11MB buffer so `express.raw({ limit: "10mb" })` rejects
    // with 413 before our handler even sees the body. The point of this
    // case is to confirm pre-charge is gated behind size validation:
    // a 100MB upload must NOT consume cap budget on rejection.
    const payload = Buffer.alloc(11 * 1024 * 1024, 0);

    const res = await request(app)
      .post("/api/transcribe")
      .set("Content-Type", "audio/wav")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer test-bearer")
      .send(payload);

    expect(res.status).toBe(413);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    const { rows } = await testPool.query(
      `SELECT 1 FROM ai_usage_daily WHERE subject_key = $1`,
      [`u:${TEST_USER_ID}`],
    );
    expect(rows).toHaveLength(0);
  });
});
