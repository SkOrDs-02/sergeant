import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

// Cold dynamic imports of the full Express app are slow on Windows when this
// route-wiring file runs inside a large parallel batch; keep assertions strict.
vi.setConfig({ testTimeout: 60_000 });

/**
 * Route-level contract tests for `POST /api/weekly-digest`.
 *
 * Covers:
 *   1. Key guard: missing `ANTHROPIC_API_KEY` → 503 `ANTHROPIC_KEY_MISSING`.
 *   2. Validation: empty body (no module sections) → 400.
 *   3. Happy path: valid payload + `LLM_DIGEST_PROVIDER=stub` returns
 *      `{ report, generatedAt }` without touching a real upstream.
 *
 * These complement `modules/digest/weekly-digest.test.ts` (unit, handler-level
 * via `createWeeklyDigestHandler({ provider })`) by asserting the full HTTP
 * wiring: setModule → rateLimit → requireSession → requireLlmUpstream →
 * handler. (requireAiQuota знято 2026-08-30: дайджест поза добовою
 * AI-квотою — рішення founder-а, див. коментар у route-файлі.)
 *
 * AI-CONTEXT: env single-source migration.  `requireAnthropicKey` reads
 * `env.ANTHROPIC_API_KEY` (validated Zod env, captured at first load of
 * `apps/server/src/env/env.ts`), so mutating `process.env` after the env
 * module loads is a no-op.  We use the canonical vitest pattern from
 * `apps/server/src/routes/coach.route.test.ts`: `vi.stubEnv` BEFORE a
 * `vi.resetModules()` + dynamic `import("./../app.js")` so the env module
 * re-parses with the stubbed values.  Driving the digest through
 * `LLM_DIGEST_PROVIDER=stub` (read via `env`, so it also needs the re-import)
 * makes the route return the deterministic template-report — no LLM mock.
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

// AI memory ingest is a fire-and-forget side-effect; stub it so the route does
// not reach BullMQ/Redis in the test process.
vi.mock("./../modules/ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: vi.fn().mockResolvedValue(undefined),
}));

// `weekly-digest` router stacks `rateLimitExpress({ key: "api:weekly-digest", … })`
// before the handler. Mock it as passthrough so a rate-limit Postgres-fallback
// query does not consume a `queryMock.mockResolvedValueOnce`. The limiter has
// its own `http/rateLimit.test.ts`.
// SEC-1 (продуктовий аудит 2026-09, той самий контракт, що B31 у
// `chat.route.test.ts`): лімітер має бачити `req.user`, інакше бакетить по IP.
const { rateLimitExpressCalls } = vi.hoisted(() => ({
  rateLimitExpressCalls: [] as Array<{ hasUser: boolean }>,
}));

vi.mock("./../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("./../http/rateLimit.js")>(
    "./../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress:
      () => (req: { user?: unknown }, _res: unknown, next: () => void) => {
        rateLimitExpressCalls.push({ hasUser: !!req.user });
        next();
      },
  };
});

async function loadCreateApp(): Promise<
  (typeof import("./../app.js"))["createApp"]
> {
  vi.resetModules();
  const mod = await import("./../app.js");
  return mod.createApp;
}

const VALID_BODY = {
  weekRange: "28 квіт – 4 трав 2026",
  finyk: {
    totalSpent: 5000,
    totalIncome: 12000,
    txCount: 34,
    topCategories: [{ name: "Продукти", amount: 1500 }],
  },
};

beforeEach(() => {
  rateLimitExpressCalls.length = 0;
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  // Дефолт — залогінений: роут стоїть за `requireSession()`, тож без юзера
  // кожен тест нижче впирався б у 401 замість своєї перевірки. Анонімну гілку
  // перевіряє окремий блок «auth guard».
  getSessionUserMock.mockResolvedValue({ id: "u1" });
  // Default: no Anthropic key (covers the key-guard test). Quota disabled so
  // `requireAiQuota` is a no-op in the happy-path test (it reads
  // `process.env.AI_QUOTA_DISABLED` at runtime — no re-import needed).
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_QUOTA_DISABLED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("weekly-digest route — auth guard", () => {
  // Знахідка A1 (`docs/90-work/audits/ai-abuse-2026-08-05.md`) — роут витрачає
  // Anthropic-ключ власника і будує звіт про особисті дані, тож сесія
  // обовʼязкова і перевіряється до ключа.
  it("POST /api/weekly-digest → 401 без сесії", async () => {
    getSessionUserMock.mockResolvedValue(null);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/weekly-digest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });
});

describe("weekly-digest route — middleware order (SEC-1)", () => {
  // `requireSession()` стоїть ПЕРЕД `rateLimitExpress` (як B31 у `chat.ts`):
  // лімітер має бачити `req.user`, інакше `rateLimitSubject` бакетить по IP
  // і «10/год на юзера» перетворюється на «10/год на NAT».
  it("лімітер бачить req.user, коли сесія є", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const createApp = await loadCreateApp();
    const app = createApp();
    await request(app)
      .post("/api/weekly-digest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(VALID_BODY);
    expect(rateLimitExpressCalls.length).toBeGreaterThan(0);
    expect(rateLimitExpressCalls.every((c) => c.hasUser)).toBe(true);
  });

  it("без сесії 401 віддається до лімітера — бакет по IP не витрачається", async () => {
    getSessionUserMock.mockResolvedValue(null);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/weekly-digest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(rateLimitExpressCalls).toEqual([]);
  });
});

describe("weekly-digest route — key guard", () => {
  it("POST /api/weekly-digest → 503 без ANTHROPIC_API_KEY", async () => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/weekly-digest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(VALID_BODY);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "ANTHROPIC_KEY_MISSING" });
  });
});

describe("weekly-digest route — validation", () => {
  it("POST /api/weekly-digest → 400 коли немає жодної секції", async () => {
    // Валідація живе в хендлері, а гейт транспорту стоїть ПЕРЕД ним, тож щоб
    // дійти до 400, треба спершу пройти гейт. Раніше для цього вистачало
    // Anthropic-ключа; тепер `requireLlmUpstream("digest")` питає про ключ
    // провайдера, який реально обере `getLLMProvider()` — а дефолт тут
    // `openrouter`, ключа шлюзу в тестах немає. Оголошуємо stub явно, як і
    // радить докстрінг цього файлу.
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("LLM_DIGEST_PROVIDER", "stub");
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/weekly-digest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ weekRange: "28 квіт – 4 трав 2026" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("weekly-digest route — happy path (stub provider)", () => {
  it("POST /api/weekly-digest → 200 з { report, generatedAt } через stub", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // `LLM_DIGEST_PROVIDER` is read via the validated `env` module, so it must
    // be stubbed before `loadCreateApp()` re-imports it. With `stub`, the
    // handler's `getLLMProvider` returns a `StubProvider` whose response is the
    // template-report JSON — a deterministic 200 without any upstream HTTP.
    vi.stubEnv("LLM_DIGEST_PROVIDER", "stub");
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/weekly-digest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      report: expect.any(Object),
      generatedAt: expect.any(String),
    });
    // The finyk section the payload provided survives into the report.
    expect(res.body.report.finyk).toMatchObject({
      summary: expect.any(String),
    });
  });
});
