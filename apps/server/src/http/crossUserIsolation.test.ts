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

// DELETE /api/me звіряє пароль через Better Auth, чий власний пул тут не
// піднято (як і весь `auth.ts`, він захоплений до старту контейнера). Кейс
// описує А без credential-акаунта, тобто `{ ok: true }`, як у проді для
// користувача з OAuth-входом; ізоляцію перевіряє `requestAccountDeletion`.
vi.mock("../modules/me/verifyAccountPassword.js", () => ({
  verifyAccountPassword: async () => ({ ok: true }),
}));

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
  "GET /api/mono/webhook":
    "валідаційний пінг Monobank (200 без даних, без БД і без секрету)",
  "GET /api/mono/webhook/:secret":
    "валідаційний пінг Monobank (200 без даних, секрет не читається)",
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
  // AI-шар: LLM-виклик потребує мока апстріма Anthropic і стріму
  "POST /api/chat",
  "POST /api/coach/insight",
  "POST /api/weekly-digest",
  // Finyk / Mono / Privat / Silpo: зовнішній виклик (банк, ДПС, MCP Сільпо,
  // vision-LLM) без мока мережі неможливий, DB-частина цих роутів нижче
  // покрита сусідніми кейсами
  "GET /api/mono/backfill-progress", // in-memory Map у процесі, у БД стану Б немає
  "GET /api/silpo/callback", // OAuth-колбек: користувач береться зі state, мок MCP
  "GET /api/silpo/cart",
  "GET /api/silpo/connect",
  "GET /api/silpo/diag",
  "POST /api/finyk/import/screenshot/analyze", // vision-LLM
  "POST /api/finyk/receipts/analyze", // vision-LLM
  "POST /api/finyk/receipts/lookup", // зовнішній ДПС
  "POST /api/mono/connect", // ходить у Monobank client-info
  "POST /api/privat/connect", // ходить у ПриватБанк
  "_ALL /api/privat", // проксі до ПриватБанку з токеном користувача
  "POST /api/silpo/cart/apply",
  "POST /api/silpo/cart/clear",
  "POST /api/silpo/cart/preview",
  "POST /api/silpo/sync", // pull чеків із MCP Сільпо
  // Nutrition: LLM-виклики, DB-стану користувача не читають і не пишуть
  "POST /api/nutrition/analyze-photo",
  "POST /api/nutrition/day-plan",
  "POST /api/nutrition/parse-pantry",
  "POST /api/nutrition/recommend-recipes",
  "POST /api/nutrition/refine-photo",
  "POST /api/nutrition/shopping-list",
  "POST /api/nutrition/week-plan",
  // Billing: усі п'ять б'ють у платіжного провайдера (LiqPay/Plata/Stripe)
  "POST /api/billing/cancel",
  "POST /api/billing/checkout",
  "POST /api/billing/plata-charge",
  "POST /api/billing/plata-status",
  "POST /api/billing/portal",
  // Push
  "POST /api/push/send", // internal fan-out за IP-allowlist, userId у тілі за задумом
  "POST /api/push/test", // реальна відправка webpush/APNs/FCM
  // Sync
  "GET /api/v2/sync/stream", // SSE: довгий потік, потребує окремого стенда
  // Інше
  "POST /api/transcribe", // зовнішній STT
];

// ───────────────────────── Частина 2: ізоляція ─────────────────────────

/** Ідентифікатори рядків Б, потрібні кейсам, щоб А «вгадав» чужий id. */
interface SeedIds {
  /** `ai_memories.id` рядка користувача Б. */
  bMemoryId: number;
  /** `import_batches.id` батча Б. */
  bBatchId: number;
  /** `receipts.id` чека Б. */
  bReceiptId: number;
  /** `silpo_receipt_items.id` позиції чека Сільпо Б. */
  bSilpoItemId: number;
}

interface Ctx {
  app: Express;
  pool: Pool;
  ids: SeedIds;
}

interface IsolationCase {
  /** Ключ `METHOD /path` у тому вигляді, як його віддає Express. */
  route: string;
  /** Додаткова підготовка стану А перед запитом (план, підписка тощо). */
  setup?: (ctx: Ctx) => Promise<void>;
  /** Запит від імені А. */
  act: (ctx: Ctx) => request.Test;
  /** Відповідь МУСИТЬ містити маркер А (позитивний контроль для GET). */
  expectsOwn?: boolean;
  /**
   * Дозволені статуси, якщо `OK_STATUSES` не підходить (наприклад, 201 для
   * створення або 400, коли відсутність чужого стану і є доказом ізоляції).
   */
  statuses?: number[];
  /** Додаткова перевірка відповіді поверх «немає маркера Б». */
  extra?: (res: request.Response) => void;
}

const asA = (t: request.Test): request.Test => t.set("x-test-user", USER_A);
const MUTATING = { ...CSRF_HEADERS };

const BACKUP_SECRET = "iso-backup-secret";
const BACKUP_TOKEN = "iso-shared-token";
const B_EXPENSE_ID = "iso-b-expense";
const B_RECEIPT_FISCAL = "4000999001";
const B_SILPO_RECEIPT = "iso-b-silpo-receipt";
const B_SILPO_TX = "iso-b-silpo-tx";
const B_DEVICE_TOKEN = "iso-b-device-token";
/** Дата, якої нема в жодних даних А: слід Б у відповіді виявляє витік без маркера. */
const B_ONLY_DATE = "2020-02-02";

const STATEMENT_CSV = [
  "Дата i час операції,Деталі операції,МСС,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Курс обміну,Сума комісій (UAH),Сума кешбеку (UAH),Залишок після операції",
  "15.01.2026 14:32:10,Сільпо,5411,-847.50,-847.50,UAH,1,0.00,8.47,5000.00",
].join("\n");

const ISOLATION_CASES: IsolationCase[] = [
  // ── AI-памʼять (ai_memories) ──
  {
    route: "GET /api/ai-memory/list",
    act: ({ app }) => asA(request(app).get("/api/ai-memory/list")),
    expectsOwn: true,
  },
  {
    route: "POST /api/ai-memory/recall",
    // recall під Pro-гейтом. Усі вектори однакові, тож без фільтра за
    // user_id у ANN-запиті в топ-K потрапив би рядок Б.
    setup: async ({ pool }) => {
      await pool.query(
        `INSERT INTO subscriptions (user_id, plan, status, provider)
         VALUES ($1, 'pro', 'active', 'manual')`,
        [USER_A],
      );
    },
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/ai-memory/recall")
          .set(MUTATING)
          .send({ query: "що ти про мене памʼятаєш" }),
      ),
    expectsOwn: true,
  },
  {
    route: "DELETE /api/ai-memory/:id",
    // Б-шний id від імені А: ідемпотентне 200 deleted:false, рядок Б живий.
    act: ({ app, ids }) =>
      asA(request(app).delete(`/api/ai-memory/${ids.bMemoryId}`).set(MUTATING)),
    extra: (res) => expect(res.body).toMatchObject({ deleted: false }),
  },
  {
    route: "DELETE /api/ai-memory",
    // «Стерти все» від А не зачіпає Б (це перевіряє знімок БД Б).
    act: ({ app }) => asA(request(app).delete("/api/ai-memory").set(MUTATING)),
  },
  // ── AI-квота (ai_usage_daily) ──
  {
    route: "GET /api/chat/usage",
    // Б спалив 3 повідомлення цього тижня; А (Free) має бачити повний ліміт.
    act: ({ app }) => asA(request(app).get("/api/chat/usage")),
    extra: (res) => {
      expect(res.body.plan).toBe("free");
      expect(res.body.limit).toBeGreaterThan(0);
      expect(res.body.remaining).toBe(res.body.limit);
    },
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
    route: "DELETE /api/me",
    // Запит на видалення від А ставить мітку лише А; Б (з власною міткою)
    // лишається як був. Пароля в А немає (без credential-акаунта).
    act: ({ app }) => asA(request(app).delete("/api/me").set(MUTATING)),
  },
  {
    route: "POST /api/me/restore",
    // А не у вікні видалення: 404, а мітка Б (яка у вікні) не знімається.
    act: ({ app }) => asA(request(app).post("/api/me/restore").set(MUTATING)),
  },
  {
    route: "GET /api/me/deletion-status",
    act: ({ app }) => asA(request(app).get("/api/me/deletion-status")),
    extra: (res) => expect(res.body).toEqual({ pending: false }),
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
  // ── Finyk: ручні витрати, імпорт, чеки ──
  {
    route: "POST /api/finyk/manual-expenses",
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/finyk/manual-expenses")
          .set(MUTATING)
          .send({ amount: 1500, category: "food", note: A_OWN }),
      ),
    statuses: [201],
    expectsOwn: true,
  },
  {
    route: "GET /api/finyk/import/batches/:id",
    act: ({ app, ids }) =>
      asA(request(app).get(`/api/finyk/import/batches/${ids.bBatchId}`)),
    statuses: [404],
  },
  {
    route: "DELETE /api/finyk/import/batches/:id",
    // Undo чужого батча: 404, рядки витрат Б не тонуть (знімок).
    act: ({ app, ids }) =>
      asA(
        request(app)
          .delete(`/api/finyk/import/batches/${ids.bBatchId}`)
          .set(MUTATING),
      ),
    statuses: [404],
  },
  {
    route: "GET /api/finyk/import/recent",
    // Батч Б датовано B_ONLY_DATE; А не має жодного.
    act: ({ app }) => asA(request(app).get("/api/finyk/import/recent")),
    extra: (res) => expect(res.text).not.toContain(B_ONLY_DATE),
  },
  {
    route: "POST /api/finyk/import/commit",
    // Б має mono-транзакцію на ту саму суму й дату. Тір-1 дедуп А не мусить
    // зарахувати її як «вже облікована»: рядок А створюється.
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/finyk/import/commit")
          .set(MUTATING)
          .send({
            source: "bank_statement",
            rows: [
              {
                date: "2026-01-15",
                amountKopiykas: 10000,
                direction: "expense",
                description: A_OWN,
                category: "food",
              },
            ],
          }),
      ),
    statuses: [200, 201],
    extra: (res) => {
      expect(res.body.created).toBe(1);
      expect(res.body.skipped).toEqual({ monoMatched: 0, duplicate: 0 });
    },
  },
  {
    route: "POST /api/finyk/import/statement/preview",
    // Б має ручну витрату на той самий день, суму й напрям: А не отримує
    // від неї мітку «схоже, вже є».
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/finyk/import/statement/preview")
          .set(MUTATING)
          .send({ csv_text: STATEMENT_CSV }),
      ),
    extra: (res) => {
      expect(res.body.rows).toHaveLength(1);
      expect(res.text).not.toContain("duplicateLikely");
    },
  },
  {
    route: "GET /api/finyk/receipts/:id",
    act: ({ app, ids }) =>
      asA(request(app).get(`/api/finyk/receipts/${ids.bReceiptId}`)),
    statuses: [404],
  },
  {
    route: "POST /api/finyk/receipts",
    // Той самий fiscalNum, що в Б. Ідемпотентність скоуплена по user_id, тож
    // А отримує СВІЙ чек, а не чек Б.
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/finyk/receipts")
          .set(MUTATING)
          .send({
            source: "dps",
            fiscalNum: B_RECEIPT_FISCAL,
            store: A_OWN,
            storeTaxId: null,
            purchasedAt: "2026-03-01T10:00:00.000Z",
            totalKopiykas: 5000,
            items: [
              {
                position: 1,
                name: A_OWN,
                qty: 1,
                priceKopiykas: 5000,
                sumKopiykas: 5000,
              },
            ],
            confidence: null,
            rawPayload: { xml: "<CHECK></CHECK>" },
            category: "food",
          }),
      ),
    statuses: [200, 201],
    expectsOwn: true,
  },
  // ── Mono ──
  {
    route: "GET /api/mono/accounts",
    act: ({ app }) => asA(request(app).get("/api/mono/accounts")),
    extra: (res) => expect(res.body).toHaveLength(1),
  },
  {
    route: "GET /api/mono/jars",
    act: ({ app }) => asA(request(app).get("/api/mono/jars")),
    expectsOwn: true,
  },
  {
    route: "GET /api/mono/transactions",
    act: ({ app }) => asA(request(app).get("/api/mono/transactions")),
    expectsOwn: true,
  },
  {
    route: "GET /api/mono/sync-state",
    // У Б підключення активне. А не підключений.
    act: ({ app }) => asA(request(app).get("/api/mono/sync-state")),
    extra: (res) => expect(res.body.status).toBe("disconnected"),
  },
  {
    route: "POST /api/mono/backfill",
    // У А є рахунки, але немає підключення: 400. Якщо токен шукається без
    // user_id, А підхопить токен Б і backfill стартує (200).
    act: ({ app }) =>
      asA(request(app).post("/api/mono/backfill").set(MUTATING)),
    statuses: [400],
  },
  {
    route: "POST /api/mono/disconnect",
    act: ({ app }) =>
      asA(request(app).post("/api/mono/disconnect").set(MUTATING)),
  },
  // ── Privat ──
  {
    route: "GET /api/privat/status",
    act: ({ app }) => asA(request(app).get("/api/privat/status")),
    extra: (res) =>
      expect(res.body).toEqual({ connected: false, merchantId: null }),
  },
  {
    route: "POST /api/privat/disconnect",
    act: ({ app }) =>
      asA(request(app).post("/api/privat/disconnect").set(MUTATING)),
  },
  // ── Silpo ──
  {
    route: "GET /api/silpo/sync-state",
    act: ({ app }) => asA(request(app).get("/api/silpo/sync-state")),
    extra: (res) => {
      expect(res.body.status).toBe("disconnected");
      expect(res.body.receiptsCount).toBe(1);
    },
  },
  {
    route: "GET /api/silpo/receipts",
    act: ({ app }) => asA(request(app).get("/api/silpo/receipts")),
    expectsOwn: true,
  },
  {
    route: "GET /api/silpo/receipts/:id",
    act: ({ app }) =>
      asA(request(app).get(`/api/silpo/receipts/${B_SILPO_RECEIPT}`)),
    statuses: [404],
  },
  {
    route: "DELETE /api/silpo/receipts/link/:transactionId",
    act: ({ app }) =>
      asA(
        request(app)
          .delete(`/api/silpo/receipts/link/${B_SILPO_TX}`)
          .set(MUTATING),
      ),
    statuses: [404],
  },
  {
    route: "POST /api/silpo/receipts/link/:transactionId",
    act: ({ app }) =>
      asA(
        request(app)
          .post(`/api/silpo/receipts/link/${B_SILPO_TX}`)
          .set(MUTATING)
          .send({ receiptId: B_SILPO_RECEIPT }),
      ),
    statuses: [404],
  },
  {
    route: "POST /api/silpo/receipts/:id/pantry-claim",
    // Позиція Б від імені А: нічого не бронюється.
    act: ({ app, ids }) =>
      asA(
        request(app)
          .post(`/api/silpo/receipts/${B_SILPO_RECEIPT}/pantry-claim`)
          .set(MUTATING)
          .send({ itemIds: [ids.bSilpoItemId], mode: "manual" }),
      ),
    extra: (res) => expect(res.body).toEqual({ claimedItemIds: [] }),
  },
  {
    route: "POST /api/silpo/receipts/:id/pantry-release",
    act: ({ app, ids }) =>
      asA(
        request(app)
          .post(`/api/silpo/receipts/${B_SILPO_RECEIPT}/pantry-release`)
          .set(MUTATING)
          .send({ itemIds: [ids.bSilpoItemId], decline: true }),
      ),
  },
  {
    route: "PUT /api/silpo/settings",
    // Тумблер автоімпорту А (підключення нема) не торкається підключення Б.
    act: ({ app }) =>
      asA(
        request(app)
          .put("/api/silpo/settings")
          .set(MUTATING)
          .send({ pantryAutoImport: true }),
      ),
    extra: (res) => expect(res.body).toEqual({ pantryAutoImportSince: null }),
  },
  {
    route: "POST /api/silpo/disconnect",
    act: ({ app }) =>
      asA(request(app).post("/api/silpo/disconnect").set(MUTATING)),
  },
  {
    route: "POST /api/silpo/wipe",
    // Стирає чеки А, чеки Б лишаються (знімок).
    act: ({ app }) => asA(request(app).post("/api/silpo/wipe").set(MUTATING)),
    extra: (res) => expect(res.body.deletedReceipts).toBe(1),
  },
  // ── Nutrition: бекапи ──
  {
    route: "POST /api/nutrition/backup-download",
    // Той самий x-token, що в Б: ключ HMAC привʼязаний до userId.
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/nutrition/backup-download")
          .set(MUTATING)
          .set("x-token", BACKUP_TOKEN),
      ),
    statuses: [404],
  },
  {
    route: "POST /api/nutrition/backup-upload",
    // Запис А під тим самим токеном не перезаписує бекап Б.
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/nutrition/backup-upload")
          .set(MUTATING)
          .set("x-token", BACKUP_TOKEN)
          .send({ blob: { note: A_OWN } }),
      ),
  },
  // ── Billing ──
  {
    route: "GET /api/billing/status",
    // Б має активний Pro; А (Free) бачить свій план.
    act: ({ app }) => asA(request(app).get("/api/billing/status")),
    extra: (res) => expect(res.body.subscription?.plan ?? "free").toBe("free"),
  },
  // ── Push ──
  {
    route: "POST /api/push/register",
    // Токен пристрою Б від імені А: 409, власник не змінюється.
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/push/register")
          .set(MUTATING)
          .send({ platform: "ios", token: B_DEVICE_TOKEN }),
      ),
    statuses: [409],
  },
  {
    route: "POST /api/push/unregister",
    // А не може погасити пристрій Б (deleted_at у Б лишається NULL).
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/push/unregister")
          .set(MUTATING)
          .send({ platform: "ios", token: B_DEVICE_TOKEN }),
      ),
  },
  // ── Sync ──
  {
    route: "GET /api/sync/audit",
    // Чужий user_id у query без адмін-прав: 403.
    act: ({ app }) =>
      asA(request(app).get("/api/sync/audit").query({ user_id: USER_B })),
    statuses: [403],
  },
  {
    route: "GET /api/v2/sync/pull",
    act: ({ app }) => asA(request(app).get("/api/v2/sync/pull")),
    expectsOwn: true,
  },
  {
    route: "POST /api/v2/sync/push",
    // А штовхає оп у рядок із id Б (з власним user_id у тілі): відхилено,
    // рядок Б не перезаписується.
    act: ({ app }) =>
      asA(
        request(app)
          .post("/api/v2/sync/push")
          .set(MUTATING)
          .send({
            ops: [
              {
                table: "finyk_manual_expenses",
                op: "update",
                row: {
                  id: B_EXPENSE_ID,
                  user_id: USER_A,
                  data_json: { id: B_EXPENSE_ID, description: A_OWN },
                },
                client_ts: new Date().toISOString(),
                idempotency_key: "iso-a-op-1",
              },
            ],
          }),
      ),
    extra: (res) =>
      expect(JSON.stringify(res.body.results)).toContain("rejected"),
  },
];

const OK_STATUSES = [200, 204, 403, 404];

/**
 * Знімок усіх рядків Б у таблицях, які торкаються кейси. Кожен запит
 * літеральний (без інтерполяції) і віддає рядок як JSON, тож будь-яка
 * зміна будь-якої колонки міняє знімок.
 */
const B_SNAPSHOT_QUERIES: ReadonlyArray<readonly [string, string]> = [
  ["user", `SELECT to_jsonb(t) AS r FROM "user" t WHERE t.id = $1 ORDER BY 1`],
  [
    "ai_memories",
    `SELECT id, content, deleted_at FROM ai_memories WHERE user_id = $1 ORDER BY id`,
  ],
  ["coach_memory", `SELECT data, version FROM coach_memory WHERE user_id = $1`],
  ["user_profile", `SELECT payload FROM user_profile WHERE user_id = $1`],
  [
    "user_preferences",
    `SELECT push_daily_cap, analytics FROM user_preferences WHERE user_id = $1`,
  ],
  [
    "ai_usage_daily",
    `SELECT to_jsonb(t) AS r FROM ai_usage_daily t WHERE t.subject_key = 'u:' || $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "subscriptions",
    `SELECT to_jsonb(t) AS r FROM subscriptions t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "finyk_manual_expenses",
    `SELECT to_jsonb(t) AS r FROM finyk_manual_expenses t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "import_batches",
    `SELECT to_jsonb(t) AS r FROM import_batches t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "receipts",
    `SELECT to_jsonb(t) AS r FROM receipts t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "receipt_items",
    `SELECT to_jsonb(i) AS r FROM receipt_items i JOIN receipts t ON t.id = i.receipt_id WHERE t.user_id = $1 ORDER BY to_jsonb(i)::text`,
  ],
  [
    "finyk_tx_receipt_links",
    `SELECT to_jsonb(l) AS r FROM finyk_tx_receipt_links l JOIN receipts t ON t.id = l.receipt_id WHERE t.user_id = $1 ORDER BY to_jsonb(l)::text`,
  ],
  [
    "mono_connection",
    `SELECT to_jsonb(t) AS r FROM mono_connection t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "mono_account",
    `SELECT to_jsonb(t) AS r FROM mono_account t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "mono_jar",
    `SELECT to_jsonb(t) AS r FROM mono_jar t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "mono_transaction",
    `SELECT to_jsonb(t) AS r FROM mono_transaction t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "privat_connection",
    `SELECT to_jsonb(t) AS r FROM privat_connection t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "silpo_connection",
    `SELECT to_jsonb(t) AS r FROM silpo_connection t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "silpo_receipts",
    `SELECT to_jsonb(t) AS r FROM silpo_receipts t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "silpo_receipt_items",
    `SELECT to_jsonb(t) AS r FROM silpo_receipt_items t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "silpo_tx_receipt_links",
    `SELECT to_jsonb(t) AS r FROM silpo_tx_receipt_links t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "push_devices",
    `SELECT to_jsonb(t) AS r FROM push_devices t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "nutrition_backups",
    `SELECT to_jsonb(t) AS r FROM nutrition_backups t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "sync_op_log",
    `SELECT to_jsonb(t) AS r FROM sync_op_log t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
  [
    "sync_audit_log",
    `SELECT to_jsonb(t) AS r FROM sync_audit_log t WHERE t.user_id = $1 ORDER BY to_jsonb(t)::text`,
  ],
];

async function snapshotB(pool: Pool): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const [label, sql] of B_SNAPSHOT_QUERIES) {
    out[label] = (await pool.query(sql, [USER_B])).rows;
  }
  return JSON.stringify(out);
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

/** Мінімальний валідний bytea для токен-колонок, де розшифровка не потрібна. */
const BYTES = Buffer.from("00", "hex");

async function seed(pool: Pool): Promise<SeedIds> {
  await seedIntegrationUser(pool, USER_A);
  await seedIntegrationUser(pool, USER_B);
  // Б у вікні видалення акаунта: перевіряє DELETE/restore /api/me.
  await pool.query(
    `UPDATE "user" SET deletion_requested_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
    [USER_B],
  );
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

  // ai_usage_daily: Б витратив 3 повідомлення цього тижня.
  const { weekStartKyiv } = await import("@sergeant/shared");
  await pool.query(
    `INSERT INTO ai_usage_daily (subject_key, usage_day, bucket, endpoint, request_count)
     VALUES ($1, $2::date, 'week:ai', 'quota', 3)`,
    [`u:${USER_B}`, weekStartKyiv()],
  );
  // Підписка: Б на Pro, А без підписки.
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, provider, provider_customer_id)
     VALUES ($1, 'pro', 'active', 'manual', $2)`,
    [USER_B, B_SECRET],
  );

  // Finyk
  await pool.query(
    `INSERT INTO finyk_manual_expenses (id, user_id, data_json)
     VALUES ($1, $2, $3::jsonb)`,
    [
      B_EXPENSE_ID,
      USER_B,
      JSON.stringify({
        id: B_EXPENSE_ID,
        date: "2026-01-15",
        description: B_SECRET,
        amount: 847.5,
        category: "food",
        kind: "expense",
      }),
    ],
  );
  const batch = await pool.query<{ id: string }>(
    `INSERT INTO import_batches
       (user_id, source, status, rows_total, rows_created, created_row_ids, created_at)
     VALUES ($1, 'bank_statement', 'completed', 1, 1, $2::jsonb, $3::timestamptz)
     RETURNING id`,
    [USER_B, JSON.stringify([B_EXPENSE_ID]), `${B_ONLY_DATE}T02:02:02Z`],
  );
  const receipt = await pool.query<{ id: string }>(
    `INSERT INTO receipts
       (user_id, source, fiscal_num, store_name, purchased_at, total_kopiykas, raw_payload)
     VALUES ($1, 'dps', $2, $3, '2026-01-15T10:00:00Z', 10000, $4::jsonb)
     RETURNING id`,
    [USER_B, B_RECEIPT_FISCAL, B_SECRET, JSON.stringify({ note: B_SECRET })],
  );
  const bReceiptId = Number(receipt.rows[0]!.id);
  await pool.query(
    `INSERT INTO receipt_items (receipt_id, position, name, price_kopiykas, sum_kopiykas)
     VALUES ($1, 1, $2, 10000, 10000)`,
    [bReceiptId, B_SECRET],
  );
  await pool.query(
    `INSERT INTO finyk_tx_receipt_links (receipt_id, tx_kind, tx_ref)
     VALUES ($1, 'manual', $2)`,
    [bReceiptId, B_EXPENSE_ID],
  );

  // Mono: токен Б зашифровано справжнім ключем, щоб дірявий lookup у
  // backfill дійсно розшифрував чужий токен, а не впав на розшифровці.
  const { encryptToken } = await import("../modules/mono/crypto.js");
  const enc = encryptToken(`token-${B_SECRET}`, "0".repeat(64));
  await pool.query(
    `INSERT INTO mono_connection
       (user_id, token_ciphertext, token_iv, token_tag, token_fingerprint,
        webhook_secret_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
    [USER_B, enc.ciphertext, enc.iv, enc.tag, B_SECRET, `hash-${B_SECRET}`],
  );
  for (const [user, acc, tag] of [
    [USER_A, "iso-a-acc", A_OWN],
    [USER_B, "iso-b-acc-1", B_SECRET],
    [USER_B, "iso-b-acc-2", B_SECRET],
  ] as const) {
    await pool.query(
      `INSERT INTO mono_account (user_id, mono_account_id, currency_code, iban, balance)
       VALUES ($1, $2, 980, $3, 100000)`,
      [user, acc, tag],
    );
  }
  await pool.query(
    `INSERT INTO mono_jar (user_id, mono_jar_id, title, currency_code, balance)
     VALUES ($1, 'iso-a-jar', $3, 980, 1000), ($2, 'iso-b-jar', $4, 980, 2000)`,
    [USER_A, USER_B, A_OWN, B_SECRET],
  );
  await pool.query(
    `INSERT INTO mono_transaction
       (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
        currency_code, description, raw, source)
     VALUES ($1, 'iso-a-acc', 'iso-a-tx', '2026-02-01T10:00:00Z', -500, -500, 980, $3, '{}'::jsonb, 'webhook'),
            ($2, 'iso-b-acc-1', 'iso-b-tx', '2026-01-15T10:00:00Z', -10000, -10000, 980, $4, '{}'::jsonb, 'webhook')`,
    [USER_A, USER_B, A_OWN, B_SECRET],
  );
  await pool.query(
    `INSERT INTO privat_connection
       (user_id, merchant_id, token_ciphertext, token_iv, token_tag, token_fingerprint)
     VALUES ($1, $2, $3, $3, $3, 'fp')`,
    [USER_B, `merchant-${B_SECRET}`, BYTES],
  );

  // Silpo
  await pool.query(
    `INSERT INTO silpo_connection
       (user_id, access_token_ciphertext, access_token_iv, access_token_tag,
        refresh_token_ciphertext, refresh_token_iv, refresh_token_tag)
     VALUES ($1, $2, $2, $2, $2, $2, $2)`,
    [USER_B, BYTES],
  );
  await pool.query(
    `INSERT INTO silpo_receipts
       (user_id, receipt_id, purchased_at, store_id, channel, total_kop, raw)
     VALUES ($1, 'iso-a-silpo-receipt', '2026-02-01T10:00:00Z', $3, 'offline', 500, '{}'::jsonb),
            ($2, $5, '2026-01-15T10:00:00Z', $4, 'offline', 10000, $6::jsonb)`,
    [
      USER_A,
      USER_B,
      A_OWN,
      B_SECRET,
      B_SILPO_RECEIPT,
      JSON.stringify({ note: B_SECRET }),
    ],
  );
  const silpoItem = await pool.query<{ id: string }>(
    `INSERT INTO silpo_receipt_items (user_id, receipt_id, name, qty, price_kop)
     VALUES ($1, $2, $3, 1, 10000) RETURNING id`,
    [USER_B, B_SILPO_RECEIPT, B_SECRET],
  );
  await pool.query(
    `INSERT INTO silpo_tx_receipt_links (user_id, transaction_id, receipt_id)
     VALUES ($1, $2, $3)`,
    [USER_B, B_SILPO_TX, B_SILPO_RECEIPT],
  );

  // Push
  await pool.query(
    `INSERT INTO push_devices (user_id, platform, token) VALUES ($1, 'ios', $2)`,
    [USER_B, B_DEVICE_TOKEN],
  );

  // Nutrition backup Б (ключ HMAC тим самим секретом, що в застосунку)
  const { safeBackupKeyFromToken } = await import("../lib/backupKey.js");
  await pool.query(
    `INSERT INTO nutrition_backups (user_id, key, payload) VALUES ($1, $2, $3::jsonb)`,
    [
      USER_B,
      safeBackupKeyFromToken(USER_B, BACKUP_TOKEN, BACKUP_SECRET),
      JSON.stringify({ note: B_SECRET }),
    ],
  );

  // Sync: оп-лог і аудит обох
  await pool.query(
    `INSERT INTO sync_op_log
       (user_id, idempotency_key, table_name, op, row, client_ts, status, origin_device_id)
     VALUES ($1, 'iso-a-seed', 'finyk_manual_expenses', 'insert', $3::jsonb, NOW(), 'applied', 'iso-seed-device'),
            ($2, 'iso-b-seed', 'finyk_manual_expenses', 'insert', $4::jsonb, NOW(), 'applied', 'iso-seed-device')`,
    [
      USER_A,
      USER_B,
      JSON.stringify({ id: "iso-a-row", note: A_OWN }),
      JSON.stringify({ id: "iso-b-row", note: B_SECRET }),
    ],
  );
  await pool.query(
    `INSERT INTO sync_audit_log (user_id, op_type, module, outcome)
     VALUES ($1, 'push', 'finyk', 'ok'), ($2, 'push', 'finyk', 'ok')`,
    [USER_A, USER_B],
  );

  return {
    bMemoryId,
    bBatchId: Number(batch.rows[0]!.id),
    bReceiptId,
    bSilpoItemId: Number(silpoItem.rows[0]!.id),
  };
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
  let ctx: Omit<Ctx, "ids"> | undefined;
  let ids: SeedIds | undefined;
  let skipReason: string | null = null;

  beforeAll(async () => {
    try {
      // Частина 1 уже імпортувала db.ts без DATABASE_URL; пул там захоплений
      // на старті модуля, тож скидаємо кеш перед підйомом контейнера.
      vi.resetModules();
      const harness = await bootIntegrationHarness({
        env: {
          AI_MEMORY_ENABLED: "true",
          VOYAGE_API_KEY: "test-voyage-key",
          SILPO_ENABLED: "true",
          SILPO_TOKEN_ENC_KEY: "0".repeat(64),
          SILPO_OAUTH_CLIENT_ID: "iso-client",
          PUBLIC_API_BASE_URL: "http://localhost:3000",
          NUTRITION_BACKUP_KEY_SECRET: BACKUP_SECRET,
        },
      });
      ctx = { app: harness.app!, pool: harness.pool };

      // recall: справжній pgvector-стор і consent, але ембеддинг без мережі
      // (константний вектор, як у `insertMemory`).
      const { __resetAiMemoryForTest } =
        await import("../modules/ai-memory/bootstrap.js");
      const { createAiMemoryService } =
        await import("../modules/ai-memory/service.js");
      const { createPgVectorStore } =
        await import("../modules/ai-memory/vectorStore.js");
      const { hasAiMemoryConsent } =
        await import("../modules/ai-memory/consent.js");
      const { default: appPool } = await import("../db.js");
      __resetAiMemoryForTest(
        createAiMemoryService({
          enabled: true,
          embeddings: {
            meta: {
              provider: "voyage",
              model: "voyage-3.5-lite",
              version: "1",
              dim: 1024,
            },
            embedBatch: async (texts: string[]) =>
              texts.map(() => new Float32Array(1024).fill(0.1)),
          },
          vectorStore: createPgVectorStore(appPool),
          isConsentEnabled: (userId) => hasAiMemoryConsent(appPool, userId),
        }),
      );
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
    ids = await seed(ctx.pool);
  });

  for (const c of ISOLATION_CASES) {
    const route = c.route;
    it(route, async (testCtx) => {
      if (!ctx || !ids) return testCtx.skip();
      const full: Ctx = { ...ctx, ids };
      await c.setup?.(full);
      const before = await snapshotB(full.pool);

      const res = await c.act(full);

      const allowed = c.statuses ?? OK_STATUSES;
      expect(
        allowed,
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
