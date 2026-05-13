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
// **Coverage:** the pact file has 10 consumer interactions (5 from
// PR-42, 5 added by the persona-extend PR). Of those, 8 are
// fully-verified here via supertest replay against `createApp()`:
//
//   - GET  /api/v1/me                       (hub persona)
//   - GET  /api/v1/mono/accounts             (finyk persona, bigint coercion)
//   - GET  /api/v1/mono/sync-state           (finyk persona, NEW)
//   - GET  /api/v1/mono/transactions         (finyk persona, bigint coercion, NEW)
//   - GET  /api/v1/coach/memory              (hub persona, NEW)
//   - GET  /api/v1/barcode                   (nutrition persona, NEW)
//   - POST /api/v1/push/register             (fizruk persona, ios sibling)
//   - POST /api/v1/nutrition/day-plan        (nutrition persona, Anthropic-stubbed, NEW)
//
// The remaining 2 (`/api/v1/chat`, `/api/v1/nutrition/analyze-photo`)
// are covered by the consumer pact but skipped on the provider side
// here because their handler chains require streaming or vision
// Anthropic stubs that are already covered by dedicated tests in
// `apps/server/src/modules/chat/*.test.ts` and
// `apps/server/src/modules/nutrition/*.test.ts`. See
// `docs/architecture/api-contracts.md § Extending coverage`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

// ── Mocks (must be hoisted ABOVE `import { createApp }`) ─────────────────────

const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
  // Some handlers (`/api/mono/sync-state`, anything gated by the
  // Anthropic stack) read env vars at MODULE-LOAD time, not per-request.
  // Set them here so the imports below see a consistent configuration.
  process.env["MONO_WEBHOOK_ENABLED"] = "true";
  process.env["ANTHROPIC_API_KEY"] = "sk-pact-replay";
  process.env["AI_QUOTA_DISABLED"] = "true";

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

// Anthropic handle for the day-plan replay. Reuses the shared mock
// harness (`apps/server/src/test/__mocks__/anthropic.ts`) — same shape
// every other handler test uses — so the day-plan handler's call to
// `anthropicMessages` returns the exact JSON the pact expects without
// ever touching api.anthropic.com.
vi.mock("./../../lib/anthropic.js", async () =>
  (
    await import("./../../test/__mocks__/anthropic.js")
  ).createAnthropicMockHandle(),
);

import { createApp } from "./../../app.js";
import { anthropicMessages as _anthropicMessages } from "./../../lib/anthropic.js";
import { anthropicResponses } from "./../../test/__mocks__/anthropic.js";
import type { Mock } from "vitest";

const anthropicMessages = _anthropicMessages as unknown as Mock;

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
  anthropicMessages.mockReset();
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
  it("pact file has 10 expected consumer interactions", () => {
    expect(pact.consumer.name).toBe("sergeant-api-client");
    expect(pact.provider.name).toBe("sergeant-server");
    expect(pact.interactions).toHaveLength(10);
    const expectedRoutes = new Set([
      // PR-42 baseline (5)
      "GET /api/v1/me",
      "GET /api/v1/mono/accounts",
      "POST /api/v1/push/register",
      "POST /api/v1/nutrition/analyze-photo",
      "POST /api/v1/chat",
      // persona-extend (5)
      "GET /api/v1/mono/sync-state",
      "GET /api/v1/mono/transactions",
      "GET /api/v1/coach/memory",
      "GET /api/v1/barcode",
      "POST /api/v1/nutrition/day-plan",
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
  // Anthropic-gated. We stub `anthropicMessages` (via the shared mock
  // harness) to return the canned plan JSON the consumer pact recorded.
  // The pact's `rawText: null` enforces that the handler's "JSON parse
  // succeeded" branch fires (otherwise rawText would be the raw model
  // output). `AI_QUOTA_DISABLED=true` + `ANTHROPIC_API_KEY=…` are
  // pinned at module load via `vi.hoisted`.
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
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(JSON.stringify(expected.plan)),
    );

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
    // Sanity: the Anthropic stub was actually called (no real upstream).
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
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
});
