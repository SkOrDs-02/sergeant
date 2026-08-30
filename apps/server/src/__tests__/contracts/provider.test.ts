// Provider-side contract verification for PR-42 (Pact contract testing).
//
// Loads the consumer-produced pact file from `packages/api-client/pacts/`
// and **replays each interaction against the real `createApp()` server**
// via supertest. Each handler's response (status + body) must match the
// pact's `response` block exactly.
//
// Why this exists alongside `pnpm api:check-openapi`:
//
//   - OpenAPI/Zod-types ensure **type-level** sync (compile-time).
//   - Pact ensures **wire-level** sync at runtime — the actual HTTP
//     response bytes from the route equal what the consumer expects.
//
// If the consumer's pact diverges from the real handler output (because
// either side was refactored without updating the other), this test
// fails before the PR can merge.
//
// **Coverage:** the pact file has 73 consumer interactions across 49
// unique routes, including the chat-usage extension, the
// billing/privat/finyk consumer expansion (2026-08-04), the
// preferences/profile consumer expansion (2026-08-04, pre-beta
// schema-debt audit: `healthDataConsent` + write-through `/api/me/profile`),
// the `activeModules` three-state expansion (2026-08-05, browser-audit
// finding B2 / migration 116 — three extra `/api/v1/me/preferences`
// interactions: `null` / `[]` / ordered array), and the receipt-scan +
// bulk-import consumer expansion (2026-08-17 — 14 interactions across 9
// new `/api/v1/finyk/{receipts,import}/*` routes), plus the
// other-bank-statement expansion (2026-08-25 — 2 interactions on ALREADY
// covered routes, no new route: `statement/preview` accepting the raw
// file (`file_base64`, XLSX/HTML-as-`.xls`/CSV in any encoding) and
// `screenshot/analyze` explaining an EMPTY draft via `dropped`/`truncated`).
// Of those, 11 routes are fully-verified here via supertest replay against
// `createApp()`:
//
//   - GET  /api/v1/me                       (hub persona)
//   - GET  /api/v1/me/preferences           (settings persona, healthDataConsent)
//   - GET  /api/v1/me/profile                (settings persona, defaults-not-404)
//   - PUT  /api/v1/me/profile                (settings persona, write-through roundtrip)
//   - GET  /api/v1/mono/accounts             (finyk persona, bigint coercion)
//   - GET  /api/v1/mono/sync-state           (finyk persona)
//   - GET  /api/v1/mono/transactions         (finyk persona, bigint coercion)
//   - GET  /api/v1/coach/memory              (hub persona)
//   - GET  /api/v1/barcode                   (nutrition persona)
//   - POST /api/v1/push/register             (fizruk persona, ios sibling)
//   - POST /api/v1/nutrition/day-plan        (nutrition persona, Anthropic-stubbed)
//
// The remaining 7 pre-existing routes (`/api/v1/chat`, `/api/v1/chat/usage`,
// `/api/v1/nutrition/analyze-photo`, `/api/v1/food-search`, `/api/v2/sync/pull`,
// `/api/v2/sync/push`, `/api/v1/nutrition/parse-pantry`) are covered by the consumer pact but
// skipped on the provider side here because their handler chains require
// streaming or vision Anthropic stubs, full v2 sync log fixtures, or
// upstream/timeout simulation that are already covered by dedicated
// tests in `apps/server/src/modules/chat/*.test.ts`,
// `apps/server/src/modules/nutrition/*.test.ts`, and
// `apps/server/src/modules/sync/*.test.ts`. See
// `docs/architecture/api-contracts.md § Extending coverage`.
//
// The 9 new receipt-scan/bulk-import routes are likewise `it.todo`
// gap-marked below (§ "Finyk receipt-scan + bulk-import — explicit gap
// markers"): 5 of the 9 handlers run multi-statement Postgres
// transactions (some with `SAVEPOINT`) and/or call an external service
// (DPS `chkAll`, the vision LLM) — replaying them here would duplicate
// the mock chains already exercised, against the SAME real handlers and
// SAME `.parse()` calls against the SAME `@sergeant/shared` schemas, by
// `apps/server/src/modules/finyk/{receipts,import}/*.test.ts` (every one
// of those tests calls the handler directly and inspects `res.body`/
// `res.statusCode` — i.e. the "real serializer" runtime proof already
// exists there, just not replayed via this pact file).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

// ── Mocks (must be hoisted ABOVE `import { createApp }`) ─────────────────────

const { mockPool, queryMock, getSessionUserMock, invokeLLMMock } = vi.hoisted(
  () => {
    // Some handlers (`/api/mono/sync-state`, anything gated by the
    // Anthropic stack) read env vars at MODULE-LOAD time, not per-request.
    // Set them here so the imports below see a consistent configuration.
    process.env["MONO_WEBHOOK_ENABLED"] = "true";
    process.env["ANTHROPIC_API_KEY"] = "sk-pact-replay";
    process.env["AI_QUOTA_DISABLED"] = "true";
    // Провайдерний шар нижче замоканий у `{ name: "stub" }`, тож оголошуємо
    // це і в конфізі. Доти конфіг казав `openrouter` (дефолт) без ключа
    // шлюзу, а працювало воно лише тому, що `getLLMProvider()` fail-soft
    // підмінював провайдера заглушкою — збіг, а не намір. Гейт
    // `requireLlmUpstream("nutrition")` тепер читає саме цю змінну.
    process.env["LLM_NUTRITION_PROVIDER"] = "stub";

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
    const invokeLLMMock = vi.fn();
    return { mockPool, queryMock, getSessionUserMock, invokeLLMMock };
  },
);

vi.mock("./../../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

// `rateLimitExpress` writes to `rate_limit_buckets` before the handler
// runs, polluting `queryMock.mock.calls[0]`. The rate-limiter itself is
// covered by `http/rateLimit.test.ts`; here we bypass it so the
// pact-replay assertions hit the handler SQL directly.
vi.mock("./../../http/rateLimit.js", async () => {
  const actual = await vi.importActual<
    typeof import("./../../http/rateLimit.js")
  >("./../../http/rateLimit.js");
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

// Day-plan replay goes through `invokeLLM()` (nutrition uses
// `LLM_NUTRITION_PROVIDER`, default openrouter → stub without a key).
// Mock the provider layer — same pattern as `day-plan.test.ts`.
vi.mock("./../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: invokeLLMMock,
}));

import { createApp } from "./../../app.js";
import type { Mock } from "vitest";

const invokeLLM = invokeLLMMock as unknown as Mock;

// ── Pact file loading ────────────────────────────────────────────────────────

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACT_FILE = path.resolve(
  HERE,
  "../../../../../packages/api-client/pacts/sergeant-api-client-sergeant-server.json",
);

interface PactInteraction {
  description: string;
  providerStates?: { name: string }[];
  request: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
}

interface PactFile {
  consumer: { name: string };
  provider: { name: string };
  interactions: PactInteraction[];
}

/**
 * AI-CONTEXT: consumer-тести @sergeant/api-client ПЕРЕЗАПИСУЮТЬ той самий
 * PACT_FILE під час свого прогону (PactV4 пише не-атомарно). Паралельний
 * turbo-запуск (`--concurrency=2`) зрідка читав файл посеред запису —
 * «SyntaxError: Unexpected end of JSON input» (CI-флейк, уперше зловлений
 * на PR #820 з web-only діфом). Структурний фікс — turbo.json:
 * `@sergeant/server#test` тепер dependsOn `@sergeant/api-client#test`,
 * тож provider-верифікація стартує лише ПІСЛЯ завершення consumer-запису.
 */
function loadPact(): PactFile {
  if (!fs.existsSync(PACT_FILE)) {
    throw new Error(
      `Pact file not found at ${PACT_FILE}. Run the consumer tests first:\n` +
        `  pnpm --filter @sergeant/api-client test -- src/__tests__/contracts/`,
    );
  }
  return JSON.parse(fs.readFileSync(PACT_FILE, "utf8")) as PactFile;
}

function findInteraction(
  pact: PactFile,
  method: string,
  pathStr: string,
): PactInteraction {
  const match = pact.interactions.find(
    (i) => i.request.method === method && i.request.path === pathStr,
  );
  if (!match) {
    throw new Error(
      `No interaction in pact for ${method} ${pathStr}. ` +
        `Pact has: ${pact.interactions
          .map((i) => `${i.request.method} ${i.request.path}`)
          .join(", ")}`,
    );
  }
  return match;
}

/**
 * `GET /api/v1/me/preferences` has two consumer interactions (consented +
 * legacy-server-without-healthDataConsent). `findInteraction` only returns
 * the first method+path match, so this variant additionally filters by a
 * substring of `description` for the routes where more than one
 * interaction shares the same method+path.
 */
function findInteractionByDescription(
  pact: PactFile,
  method: string,
  pathStr: string,
  descriptionIncludes: string,
): PactInteraction {
  const match = pact.interactions.find(
    (i) =>
      i.request.method === method &&
      i.request.path === pathStr &&
      i.description.includes(descriptionIncludes),
  );
  if (!match) {
    throw new Error(
      `No interaction in pact for ${method} ${pathStr} matching description "${descriptionIncludes}".`,
    );
  }
  return match;
}

// ── Test env / mock reset ────────────────────────────────────────────────────

// `ENV_KEYS` here are the per-test env vars (VAPID is module-load-once but
// safe to reset between tests; everything else cleared too). The
// MONO_WEBHOOK_ENABLED / ANTHROPIC_API_KEY / AI_QUOTA_DISABLED trio is
// pinned at module-load by `vi.hoisted` above — those persist for the
// whole file so the `env` singleton + the requireAnthropicKey/Quota
// middlewares see them unconditionally.
const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_EMAIL"];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  invokeLLM.mockReset();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ── Replay tests ─────────────────────────────────────────────────────────────

const pact = loadPact();

describe("Pact provider replay — consumer=sergeant-api-client, provider=sergeant-server", () => {
  it("pact file has 76 expected consumer interactions across 50 routes", () => {
    expect(pact.consumer.name).toBe("sergeant-api-client");
    expect(pact.provider.name).toBe("sergeant-server");
    // 75, не 73: +2 інтеракції 2026-08-25 на ВЖЕ покритих маршрутах
    // (файлова гілка `statement/preview` і порожній draft
    // `screenshot/analyze` із причиною) — `expectedRoutes` нижче не росте.
    // 76, не 75: +1 інтеракція на НОВОМУ маршруті `import/recent` (#930),
    // тож цього разу росте і `expectedRoutes`.
    expect(pact.interactions).toHaveLength(76);
    const expectedRoutes = new Set([
      // PR-42 baseline (5)
      "GET /api/v1/me",
      "GET /api/v1/mono/accounts",
      "GET /api/v1/mono/jars",
      "POST /api/v1/push/register",
      "POST /api/v1/nutrition/analyze-photo",
      "POST /api/v1/chat",
      // persona-extend (5)
      "GET /api/v1/mono/sync-state",
      "GET /api/v1/mono/transactions",
      "GET /api/v1/coach/memory",
      "GET /api/v1/barcode",
      "GET /api/v1/chat/usage",
      "POST /api/v1/nutrition/day-plan",
      // sync-v2 + food-search + parse-pantry extension (4)
      "GET /api/v1/food-search",
      "GET /api/v2/sync/pull",
      "POST /api/v2/sync/push",
      "POST /api/v1/nutrition/parse-pantry",
      // billing + privat + finyk consumer expansion (10)
      "GET /api/v1/billing/providers",
      "GET /api/v1/billing/status",
      "POST /api/v1/billing/cancel",
      "POST /api/v1/billing/checkout",
      "POST /api/v1/billing/portal",
      "GET /api/v1/privat",
      "GET /api/v1/privat/status",
      "POST /api/v1/privat/connect",
      "POST /api/v1/privat/disconnect",
      "POST /api/v1/finyk/manual-expenses",
      // preferences/profile consumer expansion (3) — pre-beta schema-debt
      // audit (2026-08-04): healthDataConsent + write-through user_profile.
      "GET /api/v1/me/preferences",
      "GET /api/v1/me/profile",
      "PUT /api/v1/me/profile",
      // activeModules (міграція 116, знахідка B2 браузерного аудиту
      // 2026-08-05) додала 3 інтеракції на вже наявний
      // `GET /api/v1/me/preferences` — маршрут той самий, тож набір
      // маршрутів не змінився, змінилась лише їх кількість (41 → 44).
      //
      // Receipt-scan + bulk-import consumer expansion (9 new routes, 14
      // interactions — 2026-08-17): receipt-scan v1
      // (`packages/api-client/src/__tests__/contracts/
      // finyk-receipts.contract.test.ts`) + Фаза 2 масового ведення
      // (`.../finyk-import.contract.test.ts`).
      "POST /api/v1/finyk/receipts/lookup",
      "POST /api/v1/finyk/receipts/analyze",
      "POST /api/v1/finyk/receipts",
      "GET /api/v1/finyk/receipts/501",
      "POST /api/v1/finyk/import/screenshot/analyze",
      "POST /api/v1/finyk/import/statement/preview",
      "POST /api/v1/finyk/import/commit",
      "GET /api/v1/finyk/import/batches/88",
      "DELETE /api/v1/finyk/import/batches/88",
      // плашка «залий документи» в Огляді Фініка (#930): 1 інтеракція /
      // 1 новий маршрут — дати останніх успішних батчів (75 → 76, 49 → 50).
      "GET /api/v1/finyk/import/recent",
      // silpo розлінк хибної пари (аудит 2026-08-24): 1 інтеракція / 1 маршрут
      "DELETE /api/v1/silpo/receipts/link/mono-tx-1",
      // silpo ручне привʼязування + «Повернути» (2026-08-25): 1 / 1
      "POST /api/v1/silpo/receipts/link/mono-tx-1",
      // silpo walking-skeleton (PR #819): 7 інтеракцій / 6 маршрутів
      // (sync-state має і success-, і disabled-інтеракцію; 44 → 51).
      "GET /api/v1/silpo/receipts",
      "GET /api/v1/silpo/receipts/rcpt-pact-0001",
      "GET /api/v1/silpo/sync-state",
      "POST /api/v1/silpo/disconnect",
      "POST /api/v1/silpo/sync",
      "POST /api/v1/silpo/wipe",
      // silpo кошик, трек G (PR #819): 5 інтеракцій / 3 маршрути
      // (preview має matched- і unmatched-інтеракцію, cart — звичайний,
      // порожній і schema-drift варіанти; 51 → 56).
      //
      // +1 інтеракція на вже наявний `GET /api/v1/silpo/receipts`
      // (фільтр `?transactionId=`, раунд-4 ревʼю) — маршрут той самий,
      // тож набір маршрутів не змінився, лише кількість інтеракцій.
      "GET /api/v1/silpo/cart",
      "POST /api/v1/silpo/cart/preview",
      "POST /api/v1/silpo/cart/apply",
    ]);
    const actualRoutes = new Set(
      pact.interactions.map((i) => `${i.request.method} ${i.request.path}`),
    );
    expect(actualRoutes).toEqual(expectedRoutes);
  });

  // ── GET /api/v1/me ─────────────────────────────────────────────────────────
  it("GET /api/v1/me replays against the real handler (hub persona)", async () => {
    const interaction = findInteraction(pact, "GET", "/api/v1/me");
    const expected = interaction.response.body as {
      user: {
        id: string;
        email: string;
        name: string;
        image: string | null;
        emailVerified: boolean;
        createdAt: string;
      };
    };

    // Translate the pact's expected response into the shape Better Auth's
    // `getSessionUser()` would have returned for the same user — the route
    // flattens this into the wire shape (matching the pact).
    getSessionUserMock.mockResolvedValueOnce({
      id: expected.user.id,
      email: expected.user.email,
      name: expected.user.name,
      image: expected.user.image,
      emailVerified: expected.user.emailVerified,
      createdAt: new Date(expected.user.createdAt),
    });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
  });

  // ── GET /api/v1/me/preferences ─────────────────────────────────────────────
  //
  // Single SELECT against `user_preferences`. Replays the "consented"
  // interaction (`healthDataConsent: true`) — the sibling "legacy server"
  // interaction is a pure consumer-side default-fallback test (no server
  // round-trip to replay: an old DB row simply has the column, migration
  // 111 backfills `DEFAULT false`).
  it("GET /api/v1/me/preferences replays against the real handler (settings persona, healthDataConsent)", async () => {
    const interaction = findInteractionByDescription(
      pact,
      "GET",
      "/api/v1/me/preferences",
      "consented",
    );
    const expected = interaction.response.body as {
      analytics: boolean;
      aiMemory: boolean;
      pushNotifications: boolean;
      sergeantNudges: boolean;
      healthDataConsent: boolean;
      activeModules: string[] | null;
      updatedAt: string | null;
    };

    getSessionUserMock.mockResolvedValue({ id: "user-pact-001" });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          analytics: expected.analytics,
          ai_memory: expected.aiMemory,
          push_notifications: expected.pushNotifications,
          sergeant_nudges: expected.sergeantNudges,
          health_data_consent: expected.healthDataConsent,
          // Nullable-колонка без DEFAULT (міграція 116): персона pact-а
          // ще не робила вибору модулів, тож `pg` віддає `null`, а
          // серіалізатор — `activeModules: null` («сервер не знає
          // вибору»), НЕ `[]` («вибір є і він порожній»).
          active_modules: expected.activeModules,
          updated_at: expected.updatedAt,
        },
      ],
    });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
    expect(typeof res.body.healthDataConsent).toBe("boolean");
    // Ключ мусить бути присутній навіть коли вибору немає — на цьому
    // тримається три-станова семантика на клієнті.
    expect(res.body).toHaveProperty("activeModules", null);
  });

  // ── GET /api/v1/me/profile ─────────────────────────────────────────────────
  //
  // Write-through singleton (migration 115, NOT oplog-sync). No
  // `user_profile` row for this pact persona → the handler's "defaults,
  // not 404" branch fires: `{ profile: {}, updatedAt: null }`.
  it("GET /api/v1/me/profile replays against the real handler (settings persona, defaults-not-404)", async () => {
    const interaction = findInteraction(pact, "GET", "/api/v1/me/profile");
    const expected = interaction.response.body as {
      profile: Record<string, unknown>;
      updatedAt: string | null;
    };

    getSessionUserMock.mockResolvedValue({ id: "user-pact-003" });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
  });

  // ── PUT /api/v1/me/profile ─────────────────────────────────────────────────
  //
  // Single INSERT ... ON CONFLICT DO UPDATE ... RETURNING against
  // `user_profile`. The pact locks a small biometrics payload roundtrip.
  it("PUT /api/v1/me/profile replays against the real handler (settings persona, write-through roundtrip)", async () => {
    const interaction = findInteraction(pact, "PUT", "/api/v1/me/profile");
    const expected = interaction.response.body as {
      profile: Record<string, unknown>;
      updatedAt: string | null;
    };
    const sentBody = interaction.request.body as {
      profile: Record<string, unknown>;
    };

    getSessionUserMock.mockResolvedValue({ id: "user-pact-003" });
    queryMock.mockResolvedValueOnce({
      rows: [{ payload: expected.profile, updated_at: expected.updatedAt }],
    });

    const app = createApp();
    const res = await request(app)
      .put(interaction.request.path)
      .set("Authorization", "Bearer pact-replay")
      .set("X-Requested-With", "XMLHttpRequest")
      .send(sentBody);

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
    expect(typeof res.body.updatedAt).toBe("string");
  });

  // ── GET /api/v1/mono/accounts ──────────────────────────────────────────────
  it("GET /api/v1/mono/accounts replays against the real handler (finyk persona)", async () => {
    const interaction = findInteraction(pact, "GET", "/api/v1/mono/accounts");
    const expected = interaction.response.body as Array<{
      userId: string;
      monoAccountId: string;
      sendId: string | null;
      type: string | null;
      currencyCode: number;
      cashbackType: string | null;
      maskedPan: string[];
      iban: string | null;
      balance: number | null;
      creditLimit: number | null;
      lastSeenAt: string;
    }>;

    getSessionUserMock.mockResolvedValue({ id: expected[0]!.userId });
    // The handler runs ONE SELECT against `mono_account`. Return canned
    // rows that, after `normalizeMonoAccount` + zod parse, equal the
    // pact's expected response.
    queryMock.mockResolvedValueOnce({
      rows: expected.map((acct) => ({
        userId: acct.userId,
        monoAccountId: acct.monoAccountId,
        sendId: acct.sendId,
        type: acct.type,
        currencyCode: acct.currencyCode,
        cashbackType: acct.cashbackType,
        maskedPan: acct.maskedPan,
        iban: acct.iban,
        // `pg` returns bigint as string. Force-string the canned rows
        // so the normalizer's `toNumberOrNull` actually gets exercised
        // (the very Hard-Rule #1 coercion the contract guards against).
        balance: String(acct.balance),
        creditLimit: String(acct.creditLimit),
        lastSeenAt: acct.lastSeenAt,
      })),
    });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
    // Confirm the bigint-string → number coercion happened in the
    // serializer, not via test luck.
    expect(typeof res.body[0].balance).toBe("number");
  });

  // ── POST /api/v1/push/register (ios variant) ───────────────────────────────
  //
  // The pact currently encodes the **web** variant. Replaying that
  // verbatim requires `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` set
  // BEFORE the `apps/server/src/modules/push/push.ts` module is loaded
  // (vapidReady is computed at module-load). Because vitest mocks load
  // alongside the test file, we can't reliably manipulate that
  // module-load env in a hermetic way here.
  //
  // Instead we assert that **a parallel ios request — same auth /
  // contract envelope, different platform field — round-trips through
  // the production handler**. The push-register web case is fully
  // covered at the schema-level by the pact's request validation +
  // `apps/server/src/routes/apiV1.test.ts` (which exercises the same
  // path under vapid-disabled config and asserts the validation
  // boundary).
  it("POST /api/v1/push/register replays the platform=ios sibling-shape (fizruk persona)", async () => {
    const interaction = findInteraction(pact, "POST", "/api/v1/push/register");
    expect(interaction.response.status).toBe(200);

    getSessionUserMock.mockResolvedValue({ id: "user-pact-001" });
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("Authorization", "Bearer pact-replay")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ platform: "ios", token: "t".repeat(64) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, platform: "ios" });
    // The pact's web-shape and this ios-shape share the
    // `{ ok: true, platform }` envelope — verifying the envelope here
    // guards the consumer-side `PushRegisterResponseSchema` from drift
    // for all three platforms.
    expect(res.body.ok).toBe(true);
  });

  // ── GET /api/v1/mono/sync-state ────────────────────────────────────────────
  //
  // Handler runs **two** sequential SQL reads against `pool.query`:
  //   1) SELECT status, webhook_registered_at, last_event_at, last_backfill_at FROM mono_connection
  //   2) SELECT COUNT(*)::text AS count FROM mono_account
  //
  // We canned-respond in order so the handler assembles the exact wire
  // shape the consumer pact declared. Gated behind `MONO_WEBHOOK_ENABLED`
  // (pinned via `vi.hoisted` at the top of this file).
  it("GET /api/v1/mono/sync-state replays against the real handler (finyk persona)", async () => {
    const interaction = findInteraction(pact, "GET", "/api/v1/mono/sync-state");
    const expected = interaction.response.body as {
      status: string;
      webhookActive: boolean;
      lastEventAt: string | null;
      lastBackfillAt: string | null;
      accountsCount: number;
    };

    getSessionUserMock.mockResolvedValue({ id: "user-pact-001" });
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: expected.status,
            // webhookActive=true iff status='active' AND webhook_registered_at != null.
            webhook_registered_at: expected.webhookActive
              ? new Date("2026-05-10T00:00:00.000Z")
              : null,
            last_event_at: expected.lastEventAt,
            last_backfill_at: expected.lastBackfillAt,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: String(expected.accountsCount) }],
      });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
  });

  // ── GET /api/v1/mono/transactions ──────────────────────────────────────────
  //
  // Single SELECT against `mono_transaction`. We feed the handler stringified
  // bigint columns (just like `pg` itself does in production) so the
  // `normalizeMonoTransaction` coercion + Zod parse are actually exercised
  // — Hard Rule #1 sibling-test for the transactions path.
  it("GET /api/v1/mono/transactions replays against the real handler (finyk persona)", async () => {
    const interaction = findInteraction(
      pact,
      "GET",
      "/api/v1/mono/transactions",
    );
    interface PactTx {
      userId: string;
      monoAccountId: string;
      monoTxId: string;
      time: string;
      amount: number;
      operationAmount: number;
      currencyCode: number;
      mcc: number | null;
      originalMcc: number | null;
      hold: boolean | null;
      description: string | null;
      comment: string | null;
      cashbackAmount: number | null;
      commissionRate: number | null;
      balance: number | null;
      receiptId: string | null;
      invoiceId: string | null;
      counterEdrpou: string | null;
      counterIban: string | null;
      counterName: string | null;
      categorySlug: string | null;
      categoryOverridden: boolean;
      source: string;
      receivedAt: string;
    }
    const expected = interaction.response.body as {
      data: PactTx[];
      nextCursor: string | null;
    };

    getSessionUserMock.mockResolvedValue({ id: expected.data[0]!.userId });

    // The handler asks for `LIMIT $N` with `limit + 1` (cursor-pagination
    // peek). When we return `expected.data.length` rows (== limit), the
    // handler decides `hasMore=false` and the nextCursor is `null`. Our
    // pact says nextCursor="tx-pact-0002" (the second row's id), which
    // means hasMore=TRUE; so we must return one extra peek row that the
    // handler will trim off before serialising. Build that here.
    const peekRow = {
      ...expected.data[expected.data.length - 1]!,
      monoTxId: expected.data[expected.data.length - 1]!.monoTxId + "-peek",
    };
    const sqlRows = [...expected.data, peekRow].map((tx) => ({
      userId: tx.userId,
      monoAccountId: tx.monoAccountId,
      monoTxId: tx.monoTxId,
      time: tx.time,
      // `pg` returns bigint columns as **strings**. Force-string the
      // bigint-typed fields so the normaliser's `toNumberOrNull` is
      // actually exercised (otherwise the test "passes" by accident on
      // typeof number).
      amount: String(tx.amount),
      operationAmount: String(tx.operationAmount),
      currencyCode: tx.currencyCode,
      mcc: tx.mcc,
      originalMcc: tx.originalMcc,
      hold: tx.hold,
      description: tx.description,
      comment: tx.comment,
      cashbackAmount:
        tx.cashbackAmount == null ? null : String(tx.cashbackAmount),
      commissionRate:
        tx.commissionRate == null ? null : String(tx.commissionRate),
      balance: tx.balance == null ? null : String(tx.balance),
      receiptId: tx.receiptId,
      invoiceId: tx.invoiceId,
      counterEdrpou: tx.counterEdrpou,
      counterIban: tx.counterIban,
      counterName: tx.counterName,
      categorySlug: tx.categorySlug,
      categoryOverridden: tx.categoryOverridden,
      source: tx.source,
      receivedAt: tx.receivedAt,
    }));
    queryMock.mockResolvedValueOnce({ rows: sqlRows });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .query({ from: "2026-05-01", to: "2026-05-13", limit: "2" })
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
    // Coercion didn't fall through to "stringified number".
    expect(typeof res.body.data[0].amount).toBe("number");
    expect(typeof res.body.data[0].balance).toBe("number");
  });

  // ── GET /api/v1/coach/memory ───────────────────────────────────────────────
  //
  // Single SELECT against `coach_memory WHERE user_id=$1`. Returns either
  // `{ok:true, memory:null}` (no row) or `{ok:true, memory:<jsonb>}`. The
  // contract locks the second variant so the weeklyDigests envelope is
  // pinned for the hub-side `useCoachInsight` consumer.
  it("GET /api/v1/coach/memory replays against the real handler (hub persona)", async () => {
    const interaction = findInteraction(pact, "GET", "/api/v1/coach/memory");
    const expected = interaction.response.body as {
      ok: boolean;
      memory: unknown;
    };

    getSessionUserMock.mockResolvedValue({ id: "user-pact-001" });
    queryMock.mockResolvedValueOnce({
      rows: [{ data: expected.memory }],
    });

    const app = createApp();
    const res = await request(app)
      .get(interaction.request.path)
      .set("Authorization", "Bearer pact-replay");

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
  });

  // ── GET /api/v1/barcode ────────────────────────────────────────────────────
  //
  // Open Food Facts / USDA / UPCitemdb-backed handler. We don't want to
  // hit upstream during contract replay, so we stub `globalThis.fetch`
  // to return a canned OFF response. The handler's OFF branch fires
  // first; on success the cascade short-circuits and the OFF product is
  // returned, matching the pact's success envelope.
  it("GET /api/v1/barcode replays against the real handler (nutrition persona)", async () => {
    const interaction = findInteraction(pact, "GET", "/api/v1/barcode");
    const expected = interaction.response.body as {
      product: {
        name: string;
        brand: string | null;
        kcal_100g: number | null;
        protein_100g: number | null;
        fat_100g: number | null;
        carbs_100g: number | null;
        servingSize: string | null;
        servingGrams: number | null;
        source: "off" | "usda" | "upcitemdb";
        partial?: boolean;
      };
    };

    // OFF JSON envelope. `status:1` + a `product` whose `nutriments` and
    // `serving_*` fields normalise into the pact's expected product.
    // `normalizeOFFBarcode` prefers `product_name_uk` over `product_name`
    // — we use the UK name field to match production behaviour.
    const offResponse = {
      status: 1,
      product: {
        product_name_uk: expected.product.name,
        product_name: expected.product.name,
        brands: expected.product.brand,
        nutriments: {
          "energy-kcal_100g": expected.product.kcal_100g,
          proteins_100g: expected.product.protein_100g,
          fat_100g: expected.product.fat_100g,
          carbohydrates_100g: expected.product.carbs_100g,
        },
        serving_size: expected.product.servingSize,
        serving_quantity: expected.product.servingGrams,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(offResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      const app = createApp();
      const res = await request(app)
        .get(interaction.request.path)
        .query({ barcode: "4820010840443" })
        .set("Authorization", "Bearer pact-replay");

      expect(res.status).toBe(interaction.response.status);
      expect(res.body).toEqual(expected);
      expect(res.body.product.source).toBe("off");
      // Sanity: the OFF upstream was hit exactly once (USDA/UPCitemdb
      // would be additional fetch calls — they must not be reached).
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // ── POST /api/v1/nutrition/day-plan (Anthropic-stubbed) ────────────────────
  //
  // LLM-gated. We stub `invokeLLM` to return the canned plan JSON the
  // consumer pact recorded. The pact's `rawText: null` enforces that the
  // handler's "JSON parse succeeded" branch fires (otherwise rawText would
  // be the raw model output). `AI_QUOTA_DISABLED=true` +
  // `ANTHROPIC_API_KEY=…` are pinned at module load via `vi.hoisted`.
  it("POST /api/v1/nutrition/day-plan replays against the real handler with Anthropic stub (nutrition persona)", async () => {
    const interaction = findInteraction(
      pact,
      "POST",
      "/api/v1/nutrition/day-plan",
    );
    const expected = interaction.response.body as {
      plan: {
        meals: Array<{
          type: string;
          label: string;
          name: string;
          description: string;
          ingredients: string[];
          kcal: number | null;
          protein_g: number | null;
          fat_g: number | null;
          carbs_g: number | null;
        }>;
        totalKcal: number | null;
        totalProtein_g: number | null;
        totalFat_g: number | null;
        totalCarbs_g: number | null;
        note: string;
      };
      rawText: string | null;
    };

    getSessionUserMock.mockResolvedValue({ id: "user-pact-001" });
    // The pact envelope is `{ plan, rawText: null }`. The day-plan
    // handler builds that envelope from the normalised plan + the raw
    // model output — for rawText to be `null` the model JSON must
    // already match the plan shape so `extractJsonFromText` succeeds.
    // We hand the mock exactly that JSON.
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(expected.plan),
    });

    const app = createApp();
    const res = await request(app)
      .post(interaction.request.path)
      .set("Authorization", "Bearer pact-replay")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        targets: { kcal: 2000, protein_g: 120, fat_g: 70, carbs_g: 220 },
        pantry: [
          { name: "milk", qty: 1, unit: "L" },
          { name: "oats", qty: 500, unit: "g" },
          { name: "eggs", qty: 6, unit: "pcs" },
        ],
        locale: "uk-UA",
      });

    expect(res.status).toBe(interaction.response.status);
    expect(res.body).toEqual(expected);
    // Sanity: the LLM stub was actually called (no real upstream).
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  // ── AI-flow endpoints — explicit gap markers ───────────────────────────────
  //
  // The remaining two interactions in the pact (chat, nutrition
  // analyze-photo) live behind Anthropic + AI-quota guards. Adding
  // full-handler replay here would duplicate the mock chains already
  // maintained in:
  //   - `apps/server/src/modules/chat/chat.test.ts`
  //   - `apps/server/src/modules/nutrition/*.test.ts`
  //
  // We instead lock the pact contract to a fixed expected wire-shape
  // and leave a `todo` marker so future maintenance knows where to
  // extend coverage. See `docs/architecture/api-contracts.md
  // § Extending coverage`.
  it.todo(
    "POST /api/v1/chat — replay against real chat handler (requires streaming Anthropic stub)",
  );
  it.todo(
    "POST /api/v1/nutrition/analyze-photo — replay against real handler (requires vision Anthropic stub)",
  );

  // ── Finyk receipt-scan + bulk-import — explicit gap markers ────────────────
  //
  // 9 new routes (14 interactions) added by the receipt-scan v1 +
  // "Масове ведення" consumer expansion. Each handler either calls an
  // external service (DPS `chkAll` XML lookup, the vision LLM) or runs a
  // multi-statement Postgres transaction (some with `SAVEPOINT` — the
  // mono-vs-manual-expense link decision in `save.ts`, the mono/dedup
  // tiers in `commit.ts`). Replaying them here would duplicate the mock
  // chains already exercised — against the SAME real handler code and
  // the SAME `.parse()` calls against the `@sergeant/shared` receipts/
  // import zod schemas — by the dedicated handler-level tests below
  // (every one of them calls the exported handler directly and asserts
  // `res.body`/`res.statusCode`, so the "real serializer" runtime proof
  // Hard Rule #3 asks for already exists, just not replayed via this
  // pact file):
  //   - `apps/server/src/modules/finyk/receipts/lookup.test.ts`
  //   - `apps/server/src/modules/finyk/receipts/analyze.test.ts`
  //   - `apps/server/src/modules/finyk/receipts/save.test.ts`
  //   - `apps/server/src/modules/finyk/receipts/get.test.ts`
  //   - `apps/server/src/modules/finyk/import/screenshotAnalyze.test.ts`
  //   - `apps/server/src/modules/finyk/import/statementPreview.test.ts`
  //   - `apps/server/src/modules/finyk/import/commit.test.ts`
  //   - `apps/server/src/modules/finyk/import/batches.test.ts`
  //   - `apps/server/src/routes/finyk.route.test.ts` (auth-guard + wiring)
  it.todo(
    "POST /api/v1/finyk/receipts/lookup — replay against real handler (requires DPS chkAll HTTP stub)",
  );
  it.todo(
    "POST /api/v1/finyk/receipts/analyze — replay against real handler (requires vision LLM stub)",
  );
  it.todo(
    "POST /api/v1/finyk/receipts — replay against real handler (transactional save + mono matcher)",
  );
  it.todo(
    "GET /api/v1/finyk/receipts/{id} — replay against real handler (multi-query SELECT)",
  );
  it.todo(
    "POST /api/v1/finyk/import/screenshot/analyze — replay against real handler (requires vision LLM stub)",
  );
  it.todo(
    "POST /api/v1/finyk/import/statement/preview — replay against real handler (CSV parsing + «сітка 2» duplicateLikely-запит у БД, duplicateDetect.ts)",
  );
  it.todo(
    "POST /api/v1/finyk/import/commit — replay against real handler (transactional commit + dedup tiers)",
  );
  it.todo(
    "GET /api/v1/finyk/import/batches/{id} — replay against real handler (single SELECT)",
  );
  it.todo(
    "DELETE /api/v1/finyk/import/batches/{id} — replay against real handler (transactional undo/tombstone)",
  );
});
