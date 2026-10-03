import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * L7 — `docs/security/hardening/L7-health-endpoint-info-leak.md`.
 *
 * Health endpoints are public, unauthenticated, and excluded from rate
 * limiting (so platform probes never starve), which makes them an easy
 * fingerprinting surface for opportunistic attackers. The audit fixed the
 * three response-shape invariants below; these tests are the regression
 * guard so accidental future enrichment ("let's just add a `version`
 * field to /healthz") doesn't quietly re-open the leak.
 *
 * Invariants:
 * 1. The probe endpoints (`/livez`, `/readyz`, `/health`, `/startupz`,
 *    and the nested `/health/*` aliases) must return short `text/plain`
 *    bodies — `ok` / `starting` / `unhealthy`. Anything richer is a
 *    fingerprint vector.
 * 2. The detailed `/healthz` JSON must NOT include build-identifying keys
 *    (`commit`, `sha`, `version`, `build`, `buildDate`, `buildSha`,
 *    `gitSha`, `release`). Build metadata moves to an internal,
 *    `requireApiSecret`-gated route if/when ops actually needs it.
 * 3. `/healthz` must remain reachable from openclaw `get_server_stats`
 *    and external monitoring without a session — a regression that
 *    demands auth here would silently break Phase-2 monitoring.
 * 4. Жодна health-відповідь не несе сирого ТЕКСТУ помилки підсистеми.
 *    `pg` і `ioredis` кладуть у `message` внутрішній хост, порт і імʼя
 *    DB-користувача (`password authentication failed for user
 *    "sergeant_app"`, `connect ECONNREFUSED 10.0.0.12:6379`), а роути
 *    анонімні й без rate-limit — тобто це була карта інфраструктури за
 *    один GET. Назовні дозволено лише КЛАС помилки (`errorCode`,
 *    `obs/errorCode.ts`), повний текст іде в `logger.error`. Тому `error`
 *    стоїть у `FORBIDDEN_KEYS` нижче.
 * 5. `/healthz` не перелічує імена незастосованих міграцій — лише
 *    `pendingCount`. Список імен — це карта стану схеми прода й точне
 *    вікно неузгодженості; кількості вистачає і дашборду, і алерту.
 */
const { mockPool, queryMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return { mockPool, queryMock };
});

vi.mock("../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

import { createApp } from "../app.js";
import {
  __resetAppStateForTests,
  markStartupComplete,
} from "../lib/appState.js";

const ENV_KEYS = ["DATABASE_URL", "RATE_LIMIT_DISABLED"];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  __resetAppStateForTests();
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const PROBE_BUDGET_BYTES = 32;
const FORBIDDEN_KEYS = [
  "commit",
  "sha",
  "version",
  "build",
  "buildDate",
  "buildSha",
  "gitSha",
  "release",
  // Інваріант 4 — сирий текст помилки підсистеми. Дозволений спадкоємець
  // — `errorCode` (лише клас), тож саме голе імʼя `error` тут і блокується.
  "error",
];

function collectKeysDeep(value: unknown, acc: Set<string>): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collectKeysDeep(v, acc);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    acc.add(k);
    collectKeysDeep(v, acc);
  }
}

describe("L7: probe endpoints leak no build metadata", () => {
  it.each([
    ["/livez", 200, "ok"],
    ["/readyz", 200, "ok"],
    ["/health", 200, "ok"],
    ["/health/liveness", 200, "ok"],
    ["/health/readiness", 200, "ok"],
  ])(
    "GET %s → %i text/plain '%s' (≤ budget bytes)",
    async (path, status, body) => {
      const app = createApp();
      const res = await request(app).get(path);
      expect(res.status).toBe(status);
      // text/plain, not application/json — JSON shape is its own audit
      // surface and probes have no business carrying one.
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toBe(body);
      expect(Buffer.byteLength(res.text, "utf8")).toBeLessThanOrEqual(
        PROBE_BUDGET_BYTES,
      );
    },
  );

  it("GET /startupz → 503 'starting' (budgeted)", async () => {
    const app = createApp();
    const res = await request(app).get("/startupz");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toBe("starting");
    expect(Buffer.byteLength(res.text, "utf8")).toBeLessThanOrEqual(
      PROBE_BUDGET_BYTES,
    );
  });

  it("GET /startupz → 200 'ok' after markStartupComplete() (budgeted)", async () => {
    markStartupComplete();
    const app = createApp();
    const res = await request(app).get("/startupz");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
    expect(Buffer.byteLength(res.text, "utf8")).toBeLessThanOrEqual(
      PROBE_BUDGET_BYTES,
    );
  });
});

describe("L7: /healthz JSON body excludes build identifiers", () => {
  it("does not surface commit / sha / version / build keys at any depth", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");
    // Status may be 200 or 503 depending on subsystem reachability under
    // the test harness — only the body shape matters for the audit.
    expect([200, 503]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const seen = new Set<string>();
    collectKeysDeep(res.body, seen);
    for (const k of FORBIDDEN_KEYS) {
      expect(
        seen.has(k),
        `unexpected build-identifying key '${k}' in /healthz body`,
      ).toBe(false);
    }
  });

  it("preserves the documented top-level shape for monitoring callers", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(healthy|unhealthy)$/),
      timestamp: expect.any(String),
      checks: expect.any(Object),
    });
    // Top-level keys are exactly {status, timestamp, checks} — anything
    // else is a regression and must be reviewed on the L7 audit thread
    // before merge.
    expect(Object.keys(res.body).sort()).toEqual(
      ["checks", "status", "timestamp"].sort(),
    );
  });

  it("remains reachable without a session (UptimeRobot / openclaw monitoring)", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");
    // Public probe — no 401/403 even with zero auth headers.
    expect([200, 503]).toContain(res.status);
  });
});

describe("L7: health responses carry no raw subsystem error text", () => {
  it("GET /healthz → БД недоступна: назовні errorCode, не текст помилки", async () => {
    // `pg`-помилка у тій самій формі, у якій вона приходить у проді:
    // повідомлення з іменем DB-користувача й внутрішнім хостом + SQLSTATE.
    queryMock.mockRejectedValue(
      Object.assign(
        new Error(
          'password authentication failed for user "sergeant_app" at 10.0.0.12:5432',
        ),
        { code: "28P01" },
      ),
    );

    const app = createApp();
    const res = await request(app).get("/healthz");

    expect([200, 503]).toContain(res.status);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("sergeant_app");
    expect(raw).not.toContain("10.0.0.12");
    expect(raw).not.toContain("password authentication failed");
    // Клас помилки лишається — дашборд має відрізняти «БД недоступна» від
    // «БД відмовила в автентифікації».
    expect(res.body?.checks?.database?.details?.errorCode).toBe("28P01");
  });

  it("GET /health/workers → воркер-фейл не виносить текст помилки назовні", async () => {
    queryMock.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.12:6379"), {
        code: "ECONNREFUSED",
      }),
    );

    const app = createApp();
    const res = await request(app).get("/health/workers");

    expect([200, 503]).toContain(res.status);
    const seen = new Set<string>();
    collectKeysDeep(res.body, seen);
    for (const k of FORBIDDEN_KEYS) {
      expect(
        seen.has(k),
        `unexpected leaky key '${k}' in /health/workers body`,
      ).toBe(false);
    }
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.12");
  });
});

describe("L7: /healthz reports pending migrations as a count, not a list", () => {
  it("не віддає імен незастосованих міграцій у жодному вигляді", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");

    const schemaDetails = res.body?.checks?.schema?.details as
      Record<string, unknown> | undefined;
    if (schemaDetails && "pendingCount" in schemaDetails) {
      expect(typeof schemaDetails["pendingCount"]).toBe("number");
    }
    // Ключ зі списком імен не має існувати на жодній глибині.
    const seen = new Set<string>();
    collectKeysDeep(res.body, seen);
    expect(seen.has("pending")).toBe(false);
    // Імена міграцій у репо мають форму `NNN_*.sql` — жодного такого рядка
    // у публічній відповіді бути не може.
    expect(JSON.stringify(res.body)).not.toMatch(/\d{3}_[a-z0-9_]+\.sql/i);
  });
});

describe("L7: /api/status (PR-41) inherits the info-leak invariants", () => {
  it("does not surface commit / sha / version / build keys at any depth", async () => {
    const app = createApp();
    const res = await request(app).get("/api/status");
    // `/api/status` always returns 200 (decoupled from component
    // health — see `apps/server/src/http/status.ts` header). Only the
    // body shape matters for the audit.
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const seen = new Set<string>();
    collectKeysDeep(res.body, seen);
    for (const k of FORBIDDEN_KEYS) {
      expect(
        seen.has(k),
        `unexpected build-identifying key '${k}' in /api/status body`,
      ).toBe(false);
    }
  });

  it("preserves the documented top-level shape for the public status page", async () => {
    const app = createApp();
    const res = await request(app).get("/api/status");
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(operational|degraded|down)$/),
      timestamp: expect.any(String),
      components: expect.any(Array),
    });
    // Top-level keys frozen — extending the contract (e.g. adding a
    // `notice` banner field) must land on the L7 audit thread first.
    expect(Object.keys(res.body).sort()).toEqual(
      ["components", "lastIncident", "status", "timestamp"].sort(),
    );
  });

  it("remains reachable without a session", async () => {
    const app = createApp();
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
  });
});
