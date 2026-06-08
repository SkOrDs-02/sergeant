import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract tests for `/api/v1/finyk/*`.
 *
 * Mirrors `coach.route.test.ts` (same hoisted `mockPool` / `getSessionUser`
 * mocks, same `loadCreateApp` env-reparse pattern, same passthrough
 * `rateLimitExpress` mock) and asserts the full HTTP wiring:
 * setModule → rateLimit → requireSession → asyncHandler.
 *
 * Covers:
 *   1. Auth guard: unauthenticated POST → 401.
 *   2. Happy path: authed POST with kopiykas `amount` persists a row and
 *      returns `{ ok: true, expense }` with `amountKopiykas` (money invariant
 *      — minor units round-trip) and a user-scoped INSERT.
 *   3. Validation: missing/zero/negative/float `amount` and missing
 *      `category` → 400.
 *   4. Default date: absent `date` is filled server-side (Europe/Kyiv).
 */

const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  return { mockPool, queryMock, getSessionUserMock };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

// Passthrough rate-limiter — the router stacks two `rateLimitExpress`
// layers; the Postgres-fallback bucket-check would otherwise consume our
// `queryMock.mockResolvedValueOnce` for the INSERT. Rate-limiting itself has
// `http/rateLimit.test.ts`; here we test route-wiring + handler-shape.
vi.mock("./../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("./../http/rateLimit.js")>(
    "./../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

async function loadCreateApp(): Promise<
  (typeof import("./../app.js"))["createApp"]
> {
  vi.resetModules();
  const mod = await import("./../app.js");
  return mod.createApp;
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  vi.stubEnv("AI_QUOTA_DISABLED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("finyk routes — auth guard", () => {
  it("POST /api/v1/finyk/manual-expenses → 401 без сесії", async () => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/finyk/manual-expenses")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ amount: 20000, category: "food" });
    expect(res.status).toBe(401);
  });
});

describe("finyk routes — POST /manual-expenses happy path", () => {
  it("персистить рядок і повертає expense у копійках", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const now = new Date("2026-06-06T10:00:00.000Z");
    // INSERT ... RETURNING — handler читає rows[0]. `data_json` зберігається
    // у гривнях (LS-парність), серіалізатор віддає копійки назад.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          data_json: {
            id: "11111111-1111-1111-1111-111111111111",
            date: "2026-06-06",
            description: "кава",
            amount: 200,
            category: "food",
          },
          created_at: now,
          updated_at: now,
        },
      ],
    });

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/finyk/manual-expenses")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        amount: 20000,
        category: "food",
        date: "2026-06-06",
        note: "кава",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      expense: {
        id: "11111111-1111-1111-1111-111111111111",
        amountKopiykas: 20000,
        category: "food",
        date: "2026-06-06",
        note: "кава",
      },
    });

    // INSERT scopes on the session user — `user_id` never comes from body.
    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO finyk_manual_expenses"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1][1]).toBe("u1");
    // Stored blob keeps amount in hryvnia (kopiykas / 100).
    const storedBlob = JSON.parse(insertCall![1][2]);
    expect(storedBlob.amount).toBe(200);
    expect(storedBlob.category).toBe("food");
  });

  it("без `date` підставляє Kyiv-сьогодні (YYYY-MM-DD у blob)", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const now = new Date();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          data_json: {
            id: "22222222-2222-2222-2222-222222222222",
            date: "2026-06-06",
            description: "",
            amount: 50,
            category: "transport",
          },
          created_at: now,
          updated_at: now,
        },
      ],
    });

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/finyk/manual-expenses")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ amount: 5000, category: "transport" });

    expect(res.status).toBe(201);
    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO finyk_manual_expenses"),
    );
    const storedBlob = JSON.parse(insertCall![1][2]);
    expect(storedBlob.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(storedBlob.description).toBe("");
  });
});

describe("finyk routes — POST /manual-expenses validation", () => {
  it.each([
    ["missing amount", { category: "food" }],
    ["zero amount", { amount: 0, category: "food" }],
    ["negative amount", { amount: -100, category: "food" }],
    [
      "float amount (kopiykas must be integer)",
      { amount: 199.5, category: "food" },
    ],
    ["missing category", { amount: 1000 }],
    ["empty category", { amount: 1000, category: "" }],
    ["bad date format", { amount: 1000, category: "food", date: "06/06/2026" }],
  ])("повертає 400 при невалідному body (%s)", async (_label, body) => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/finyk/manual-expenses")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(body);
    expect(res.status).toBe(400);
  });
});
