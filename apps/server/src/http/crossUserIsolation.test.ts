/**
 * Гейт крос-юзер ізоляції (Стадія 1 спеки
 * `docs/work/specs/rls-ai-tables-and-isolation-gate.md`, лінія Б1-Б3).
 *
 * Авторизація в Sergeant тримається на тому, що кожен SQL-запит вручну
 * дописує `WHERE user_id = $1`. Цей файл механічно перевіряє, що
 * користувач А не бачить і не змінює дані користувача Б. Він складається
 * з двох частин:
 *
 *  1. ПОВНОТА (без БД, працює завжди). Збирає фактичні роути з Express
 *     і вимагає, щоб кожен був або описаний ізоляційним кейсом
 *     (`ISOLATION_CASES`), або свідомо винесений як не-user-scoped
 *     (`NOT_USER_SCOPED`, з причиною), або записаний у `TODO_UNCOVERED`.
 *     Новий роут, якого немає в жодному списку, валить тест: масив не може
 *     тихо відстати від коду. Застарілі записи (роута вже нема) теж валять.
 *
 *  2. ІЗОЛЯЦІЯ (потрібен Postgres через Testcontainers). Для кожного кейсу
 *     кладе дані Б, робить запит від імені А і вимагає: відповідь не
 *     містить маркера Б, а стан рядків Б у БД не змінився. Без Docker ця
 *     частина скіпається так само, як інші `*.integration.test.ts`
 *     (`REQUIRE_ISOLATION_DB=1` перетворює скіп на помилку).
 *
 * Це гейт ДО ввімкнення RLS: він має бути зеленим на поточному коді, інакше
 * після політик не відрізнити «RLS зламав легітимний доступ» від «тут
 * завжди був витік».
 *
 * Як додати роут у покриття: перенеси його ключ із `TODO_UNCOVERED` у новий
 * запис `ISOLATION_CASES`. Список `TODO_UNCOVERED` має лише скорочуватись.
 */
import express, { type Express } from "express";
import request from "supertest";
import type { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  applyIntegrationEnv,
  bootIntegrationHarness,
  CSRF_HEADERS,
  INTEGRATION_TIMEOUT_MS,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
} from "../test/createIntegrationApp.js";

/** Маркер, який НІКОЛИ не має з'явитись у відповіді для користувача А. */
const B_SECRET = "ISOLATION-B-SECRET";
/** Маркер власних даних А: доказ, що тест не порожній (позитивний контроль). */
const A_OWN = "ISOLATION-A-OWN";

const USER_A = "user_iso_a";
const USER_B = `user_iso_b_${B_SECRET}`;

// Сесія береться із заголовка, а не з Better Auth: тест перевіряє WHERE у
// хендлерах, а не сам логін. Реальний `auth.ts` лишається (importOriginal),
// щоб `createApp()` збирався як у проді.
vi.mock("../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.js")>();
  const resolve = async (req: { headers: Record<string, unknown> }) => {
    const id = req.headers["x-test-user"];
    if (typeof id !== "string" || id === "") return null;
    return {
      id,
      email: `${id}@test.local`,
      name: id,
      image: null,
      emailVerified: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
  };
  return {
    ...actual,
    getSessionUser: resolve,
    getFreshSessionUser: resolve,
  };
});

// ───────────────────────── Частина 1: повнота ──────────────────────────

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: RouteLayer[] };
}
type AppWithRouter = Express & {
  router?: { stack?: RouteLayer[] };
  _router?: { stack?: RouteLayer[] };
};

function collectRoutes(stack: RouteLayer[] | undefined): string[] {
  const out: string[] = [];
  for (const layer of stack ?? []) {
    if (layer.route) {
      for (const [m, on] of Object.entries(layer.route.methods)) {
        if (on) out.push(`${m.toUpperCase()} ${layer.route.path}`);
      }
    } else if (layer.handle?.stack) {
      out.push(...collectRoutes(layer.handle.stack));
    }
  }
  return out;
}

/** Ключі виду `METHOD /path` усіх роутів, які монтує `registerRoutes`. */
async function registeredRoutes(): Promise<string[]> {
  applyIntegrationEnv({ ANTHROPIC_API_KEY: "test-key" });
  const { registerRoutes } = await import("../routes/index.js");
  const app = express();
  // Пул не використовується при монтуванні, лише замикається в хендлерах.
  registerRoutes(app, { pool: {} as unknown as Pool });
  const a = app as AppWithRouter;
  const stack = a.router?.stack ?? a._router?.stack;
  return [...new Set(collectRoutes(stack))].sort();
}

/**
 * Роути, які свідомо не мають користувацького скоупу. Кожен запис із
 * причиною: «просто забув» тут не годиться, це список для рев'ю.
 */
const NOT_USER_SCOPED: Record<string, string> = {
  "GET /health": "health-probe платформи",
  "GET /health/liveness": "health-probe платформи",
  "GET /health/readiness": "health-probe платформи",
  "GET /health/startup": "health-probe платформи",
  "GET /health/workers": "health-probe платформи",
  "GET /healthz": "health-probe платформи",
  "GET /livez": "health-probe платформи",
  "GET /readyz": "health-probe платформи",
  "GET /startupz": "health-probe платформи",
  "GET /metrics": "Prometheus scrape, захищений секретом",
  "GET /api/status": "публічний статус сервісу, без user-даних",
  "_ALL /api/auth/{*splat}":
    "Better Auth: власний auth-шар, не user_id-фільтри",
  "GET /api/barcode": "глобальний довідник продуктів, відкритий без сесії",
  "GET /api/food-search": "глобальний довідник продуктів, відкритий без сесії",
  "GET /api/push/vapid-public": "публічний VAPID-ключ",
  "GET /api/billing/providers":
    "перелік провайдерів за країною, без user-даних",
  "POST /api/billing/liqpay-callback":
    "вебхук провайдера, підпис замість сесії",
  "POST /api/billing/stripe-webhook": "вебхук провайдера, підпис замість сесії",
  "POST /api/mono/webhook": "вебхук Monobank, секрет замість сесії",
  "POST /api/mono/webhook/:secret": "вебхук Monobank, секрет у шляху",
  "POST /api/telegram/webhook": "вебхук Telegram, секрет замість сесії",
  "POST /api/csp-report": "публічний прийом CSP-звітів",
  "POST /api/metrics/web-vitals": "публічний прийом web-vitals",
  "POST /api/waitlist": "публічна форма листа очікування",
  "POST /api/v1/waitlist": "публічна форма листа очікування",
  "POST /api/feedback": "публічна форма зворотного зв'язку, лише запис",
  "POST /api/v1/feedback": "публічна форма зворотного зв'язку, лише запис",
  "GET /api/email/unsubscribe": "одноразове посилання з підписаним токеном",
};

/** `/api/internal/*`: machine-to-machine, `requireInternalIp` + INTERNAL_API_KEY. */
function isInternal(key: string): boolean {
  return key.split(" ")[1]!.startsWith("/api/internal/");
}

/**
 * user-scoped роути, ще не покриті ізоляційним кейсом. ТІЛЬКИ скорочувати:
 * перенос ключа в `ISOLATION_CASES` — це і є прогрес по спеці.
 */
const TODO_UNCOVERED: readonly string[] = [
  // AI-шар
  "POST /api/ai-memory/recall", // потребує Voyage-ембеддинга й feature-gate
  "GET /api/chat/usage", // потребує ai_usage_daily з бакетами тижня (Київ)
  "POST /api/chat", // LLM-виклик, потребує мок апстріма
  "POST /api/coach/insight", // LLM-виклик
  "POST /api/weekly-digest", // LLM-виклик
  // me/*
  "DELETE /api/me", // деструктивний, потребує звірки пароля
  "POST /api/me/restore",
  // Finyk / Mono / Privat / Silpo
  "DELETE /api/finyk/import/batches/:id",
  "DELETE /api/silpo/receipts/link/:transactionId",
  "GET /api/finyk/import/batches/:id",
  "GET /api/finyk/import/recent",
  "GET /api/finyk/receipts/:id",
  "GET /api/mono/accounts",
  "GET /api/mono/backfill-progress",
  "GET /api/mono/jars",
  "GET /api/mono/sync-state",
  "GET /api/mono/transactions",
  "GET /api/privat/status",
  "GET /api/silpo/callback",
  "GET /api/silpo/cart",
  "GET /api/silpo/connect",
  "GET /api/silpo/diag",
  "GET /api/silpo/receipts",
  "GET /api/silpo/receipts/:id",
  "GET /api/silpo/sync-state",
  "POST /api/finyk/import/commit",
  "POST /api/finyk/import/screenshot/analyze",
  "POST /api/finyk/import/statement/preview",
  "POST /api/finyk/manual-expenses",
  "POST /api/finyk/receipts",
  "POST /api/finyk/receipts/analyze",
  "POST /api/finyk/receipts/lookup",
  "POST /api/mono/backfill",
  "POST /api/mono/connect",
  "POST /api/mono/disconnect",
  "POST /api/privat/connect",
  "POST /api/privat/disconnect",
  "_ALL /api/privat",
  "POST /api/silpo/cart/apply",
  "POST /api/silpo/cart/clear",
  "POST /api/silpo/cart/preview",
  "POST /api/silpo/disconnect",
  "POST /api/silpo/receipts/link/:transactionId",
  "POST /api/silpo/receipts/:id/pantry-claim",
  "POST /api/silpo/receipts/:id/pantry-release",
  "PUT /api/silpo/settings",
  "POST /api/silpo/sync",
  "POST /api/silpo/wipe",
  // Nutrition
  "POST /api/nutrition/analyze-photo",
  "POST /api/nutrition/backup-download",
  "POST /api/nutrition/backup-upload",
  "POST /api/nutrition/day-plan",
  "POST /api/nutrition/parse-pantry",
  "POST /api/nutrition/recommend-recipes",
  "POST /api/nutrition/refine-photo",
  "POST /api/nutrition/shopping-list",
  "POST /api/nutrition/week-plan",
  // Billing
  "GET /api/billing/status",
  "POST /api/billing/cancel",
  "POST /api/billing/checkout",
  "POST /api/billing/plata-charge",
  "POST /api/billing/plata-status",
  "POST /api/billing/portal",
  // Push
  "POST /api/push/register",
  "POST /api/push/send",
  "POST /api/push/test",
  "POST /api/push/unregister",
  // Sync
  "GET /api/sync/audit",
  "GET /api/v2/sync/pull",
  "GET /api/v2/sync/stream",
  "POST /api/v2/sync/push",
  // Інше
  "POST /api/transcribe",
];

// ───────────────────────── Частина 2: ізоляція ─────────────────────────

interface Ctx {
  app: Express;
  pool: Pool;
  /** `ai_memories.id` рядка користувача Б. */
  bMemoryId: number;
}

interface IsolationCase {
  /** Ключ `METHOD /path` у тому вигляді, як його віддає Express. */
  route: string;
  /** Запит від імені А. */
  act: (ctx: Ctx) => request.Test;
  /** Відповідь МУСИТЬ містити маркер А (позитивний контроль для GET). */
  expectsOwn?: boolean;
  /** Додаткова перевірка відповіді поверх «немає маркера Б». */
  extra?: (res: request.Response) => void;
}

const asA = (t: request.Test): request.Test => t.set("x-test-user", USER_A);
const MUTATING = { ...CSRF_HEADERS };

const ISOLATION_CASES: IsolationCase[] = [
  // ── AI-памʼять (ai_memories) ──
  {
    route: "GET /api/ai-memory/list",
    act: ({ app }) => asA(request(app).get("/api/ai-memory/list")),
    expectsOwn: true,
  },
  {
    route: "DELETE /api/ai-memory/:id",
    // Б-шний id від імені А: ідемпотентне 200 deleted:false, рядок Б живий.
    act: ({ app, bMemoryId }) =>
      asA(request(app).delete(`/api/ai-memory/${bMemoryId}`).set(MUTATING)),
    extra: (res) => expect(res.body).toMatchObject({ deleted: false }),
  },
  {
    route: "DELETE /api/ai-memory",
    // «Стерти все» від А не зачіпає Б (це перевіряє знімок БД Б).
    act: ({ app }) => asA(request(app).delete("/api/ai-memory").set(MUTATING)),
  },
  // ── coach_memory ──
  {
    route: "GET /api/coach/memory",
    act: ({ app }) => asA(request(app).get("/api/coach/memory")),
    expectsOwn: true,
  },
  {
    route: "POST /api/coach/memory",
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/coach/memory")
          .set(MUTATING)
          .send({ weeklyDigest: { weekKey: "2026-W01" } }),
      ),
  },
  // ── me/* ──
  {
    route: "GET /api/me",
    act: ({ app }) => asA(request(app).get("/api/me")),
  },
  {
    route: "GET /api/me/deletion-status",
    act: ({ app }) => asA(request(app).get("/api/me/deletion-status")),
  },
  {
    route: "GET /api/me/export",
    act: ({ app }) => asA(request(app).get("/api/me/export")),
    // ai_memories у експорт не входять (EXPORT_EXCLUSIONS), тож позитивний
    // контроль тут: у файлі є сам користувач А.
    extra: (res) => expect(res.text).toContain(USER_A),
  },
  {
    route: "GET /api/me/preferences",
    act: ({ app }) => asA(request(app).get("/api/me/preferences")),
    // Б виставив pushDailyCap=4; А має бачити дефолт, не чуже значення.
    extra: (res) => expect(res.body.pushDailyCap).not.toBe(4),
  },
  {
    route: "PATCH /api/me/preferences",
    act: ({ app }) =>
      asA(
        request(app)
          .patch("/api/me/preferences")
          .set(MUTATING)
          .send({ analytics: false }),
      ),
    extra: (res) => expect(res.body.pushDailyCap).not.toBe(4),
  },
  {
    route: "GET /api/me/profile",
    act: ({ app }) => asA(request(app).get("/api/me/profile")),
    expectsOwn: true,
  },
  {
    route: "PUT /api/me/profile",
    act: ({ app }) =>
      asA(
        request(app)
          .put("/api/me/profile")
          .set(MUTATING)
          .send({ profile: { note: A_OWN } }),
      ),
    expectsOwn: true,
  },
];

const OK_STATUSES = [200, 204, 403, 404];

/** Знімок усіх рядків Б у таблицях, які торкаються кейси. */
async function snapshotB(pool: Pool): Promise<string> {
  const q = async (sql: string) => (await pool.query(sql, [USER_B])).rows;
  return JSON.stringify({
    user: await q(`SELECT id, email FROM "user" WHERE id = $1`),
    memories: await q(
      `SELECT id, content, deleted_at FROM ai_memories WHERE user_id = $1 ORDER BY id`,
    ),
    coach: await q(`SELECT data, version FROM coach_memory WHERE user_id = $1`),
    profile: await q(`SELECT payload FROM user_profile WHERE user_id = $1`),
    prefs: await q(
      `SELECT push_daily_cap, analytics FROM user_preferences WHERE user_id = $1`,
    ),
  });
}

async function insertMemory(
  pool: Pool,
  userId: string,
  content: string,
): Promise<number> {
  const { rows } = await pool.query<{ id: string | number }>(
    `INSERT INTO ai_memories
       (user_id, source, content, embedding,
        embedding_provider, embedding_model, embedding_version)
     VALUES ($1, 'digest', $2, array_fill(0.1::real, ARRAY[1024])::halfvec(1024),
             'voyage', 'voyage-3.5-lite', '1')
     RETURNING id`,
    [userId, content],
  );
  return Number(rows[0]!.id);
}

async function seed(pool: Pool): Promise<number> {
  await seedIntegrationUser(pool, USER_A);
  await seedIntegrationUser(pool, USER_B);
  await insertMemory(pool, USER_A, `${A_OWN} memory`);
  const bMemoryId = await insertMemory(pool, USER_B, `${B_SECRET} memory`);
  await pool.query(
    `INSERT INTO coach_memory (user_id, data) VALUES ($1, $3::jsonb), ($2, $4::jsonb)`,
    [
      USER_A,
      USER_B,
      JSON.stringify({ note: A_OWN }),
      JSON.stringify({ note: B_SECRET }),
    ],
  );
  await pool.query(
    `INSERT INTO user_profile (user_id, payload) VALUES ($1, $3::jsonb), ($2, $4::jsonb)`,
    [
      USER_A,
      USER_B,
      JSON.stringify({ note: A_OWN }),
      JSON.stringify({ note: B_SECRET }),
    ],
  );
  await pool.query(
    `INSERT INTO user_preferences (user_id, push_daily_cap) VALUES ($1, 4)`,
    [USER_B],
  );
  return bMemoryId;
}

// ───────────────────────────── Тести ─────────────────────────────

describe("crossUserIsolation: повнота списку роутів (без БД)", () => {
  const covered = ISOLATION_CASES.map((c) => c.route);

  it("кожен зареєстрований роут описаний: кейс, не-user-scoped або TODO", async () => {
    const known = new Set<string>([
      ...covered,
      ...Object.keys(NOT_USER_SCOPED),
      ...TODO_UNCOVERED,
    ]);
    const unclassified = (await registeredRoutes()).filter(
      (r) => !known.has(r) && !isInternal(r),
    );
    // Якщо тут щось є: новий роут. user-scoped → додай кейс у ISOLATION_CASES
    // (або, якщо покрити зараз неможливо, у TODO_UNCOVERED). Публічний /
    // вебхук → у NOT_USER_SCOPED із причиною.
    expect(unclassified).toEqual([]);
  });

  it("у списках немає застарілих ключів (роута вже не існує)", async () => {
    const registered = new Set(await registeredRoutes());
    const stale = [
      ...covered,
      ...Object.keys(NOT_USER_SCOPED),
      ...TODO_UNCOVERED,
    ].filter((k) => !registered.has(k));
    expect(stale).toEqual([]);
  });

  it("ключ живе рівно в одному зі списків", () => {
    const all = [
      ...covered,
      ...Object.keys(NOT_USER_SCOPED),
      ...TODO_UNCOVERED,
    ];
    const dupes = all.filter((k, i) => all.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it("/api/internal/* ніколи не потрапляє в user-scoped списки", () => {
    const misplaced = [...covered, ...TODO_UNCOVERED].filter(isInternal);
    expect(misplaced).toEqual([]);
  });
});

describe("crossUserIsolation: А не бачить і не змінює дані Б", () => {
  let ctx: Omit<Ctx, "bMemoryId"> | undefined;
  let bMemoryId = 0;
  let skipReason: string | null = null;

  beforeAll(async () => {
    try {
      // Частина 1 уже імпортувала db.ts без DATABASE_URL; пул там захоплений
      // на старті модуля, тож скидаємо кеш перед підйомом контейнера.
      vi.resetModules();
      const harness = await bootIntegrationHarness();
      ctx = { app: harness.app!, pool: harness.pool };
    } catch (e) {
      if (process.env["REQUIRE_ISOLATION_DB"] === "1") throw e;
      skipReason = e instanceof Error ? e.message : String(e);
      console.warn(
        `[crossUserIsolation] БД-частину пропущено: testcontainers недоступний (${skipReason}). ` +
          "Ставте REQUIRE_ISOLATION_DB=1, щоб це було помилкою.",
      );
    }
  }, INTEGRATION_TIMEOUT_MS);

  afterAll(async () => {
    await shutdownIntegrationHarness();
  }, INTEGRATION_TIMEOUT_MS);

  beforeEach(async () => {
    if (!ctx) return;
    await truncateIntegrationTables(ctx.pool);
    bMemoryId = await seed(ctx.pool);
  });

  for (const c of ISOLATION_CASES) {
    const route = c.route;
    it(route, async (testCtx) => {
      if (!ctx) return testCtx.skip();
      const full: Ctx = { ...ctx, bMemoryId };
      const before = await snapshotB(full.pool);

      const res = await c.act(full);

      expect(
        OK_STATUSES,
        `${route}: неочікуваний статус ${res.status} (тіло: ${res.text.slice(0, 200)})`,
      ).toContain(res.status);
      expect(
        res.text.includes(B_SECRET),
        `${route}: відповідь для А містить дані Б`,
      ).toBe(false);
      if (c.expectsOwn) {
        expect(
          res.text.includes(A_OWN),
          `${route}: А не побачив власні дані (тест порожній?)`,
        ).toBe(true);
      }
      c.extra?.(res);

      expect(
        await snapshotB(full.pool),
        `${route}: запит від А змінив рядки Б`,
      ).toBe(before);
    });
  }
});
