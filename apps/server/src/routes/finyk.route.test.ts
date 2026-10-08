import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import request from "supertest";

// Windows module reloads for route-level app imports can exceed Vitest's default
// timeout in large batches; keep assertions strict.
vi.setConfig({ testTimeout: 60_000 });

/**
 * Route-level contract tests for `/api/v1/finyk/*`.
 *
 * Mirrors `coach.route.test.ts` (same hoisted `mockPool` / `getSessionUser`
 * mocks, same `loadCreateApp` env-reparse pattern, same passthrough
 * `rateLimitExpress` mock) and asserts the full HTTP wiring:
 * setModule → rateLimit → requireSession → handler.
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

// Гейт вікна видалення в `requireSession` ходить у глобальний пул за
// міткою; тест його не мокає, тож без заглушки маршрут падав у 500 або
// з'їдав чужі `mockResolvedValueOnce`.
vi.mock("../modules/me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../modules/me/dataRights.js")>()),
  getAccountDeletionStatus: vi.fn(async () => ({ pending: false })),
}));

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
vi.mock("./../http/index.js", async () => {
  const actual =
    await vi.importActual<typeof import("./../http/index.js")>(
      "./../http/index.js",
    );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

// Холодний імпорт усього застосунку на слабкій машині триває десятки
// секунд. Без прогріву перший тест файлу впирався у свої 60 с, а його
// недороблений імпорт добігав уже під час наступного тесту і з'їдав його
// `mockResolvedValueOnce`: звідси каскад «випадкових» падінь.
beforeAll(async () => {
  await import("./../app.js");
}, 300_000);

async function loadCreateApp(): Promise<
  (typeof import("./../app.js"))["createApp"]
> {
  vi.resetModules();
  const mod = await import("./../app.js");
  return mod.createApp;
}

/**
 * `createManualExpense` працює через `pool.connect()` + транзакцію (data-16):
 * INSERT рядка йде в `queryMock` (як і раніше), службові BEGIN/COMMIT/ROLLBACK
 * і запис опа в `sync_op_log` фіксуються в `clientSql`.
 */
const clientSql: string[] = [];
function wireTxClient(): void {
  mockPool.connect.mockResolvedValue({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      clientSql.push(sql.trim());
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };
      if (sql.includes("INSERT INTO sync_op_log")) {
        return { rows: [], rowCount: 1 };
      }
      return queryMock(sql, params);
    }),
    release: vi.fn(),
  });
}

beforeEach(() => {
  clientSql.length = 0;
  mockPool.connect.mockReset();
  wireTxClient();
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

    // data-16: оп у sync_op_log — у тій самій транзакції (BEGIN ... COMMIT).
    expect(clientSql.some((q) => q.includes("INSERT INTO sync_op_log"))).toBe(
      true,
    );
    expect(clientSql[0]).toBe("BEGIN");
    expect(clientSql.at(-1)).toBe("COMMIT");
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

/**
 * Чек-скан v1 (`docs/work/specs/receipt-scan.md`) —
 * route-рівень: guard-ланцюг (setModule → rateLimit → requireSession) +
 * повний-стек ДПС-503-без-токена. Глибша бізнес-логіка (matcher,
 * XML-парсинг, vision-нормалізація, ідемпотентність, серіалізація) уже
 * покрита handler-unit-тестами в `modules/finyk/receipts/*.test.ts` — тут
 * лише підтвердження, що роутер реально монтує ці handler-и під
 * правильними guard-ами.
 */
describe("finyk routes — чек-скан v1 auth guard", () => {
  it.each([
    ["POST", "/api/v1/finyk/receipts/lookup"],
    ["POST", "/api/v1/finyk/receipts/analyze"],
    ["POST", "/api/v1/finyk/receipts"],
    ["GET", "/api/v1/finyk/receipts/1"],
  ])("%s %s → 401 без сесії", async (method, path) => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      [method.toLowerCase() as "get" | "post"](path)
      .set("X-Requested-With", "XMLHttpRequest")
      .send({});
    expect(res.status).toBe(401);
  });
});

describe("finyk routes — POST /receipts/lookup без DPS_API_TOKEN", () => {
  it("503 DPS_TOKEN_MISSING на весь стек (роутер → guard → handler → env)", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    vi.stubEnv("DPS_API_TOKEN", "");
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/finyk/receipts/lookup")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        fn: "4000123456",
        id: "RRO001",
        date: "20260115",
        time: "143210",
        sm: "150.00",
      });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("DPS_TOKEN_MISSING");
  });
});
