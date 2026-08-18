import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level contract tests for `/api/silpo/*`.
 *
 * Wires the real `createSilpoRouter()` against mocked `db`, `env`,
 * `modules/silpo/{oauth,tokenStore,receipts}` and a `requireSession` stand-in
 * that mirrors the REAL middleware's contract (`req.user = {id}`) rather
 * than the `res.locals` shape some other route contract tests use — this
 * suite exercises the actual (unmocked) `routes/silpo.ts` handlers, so it
 * must match what they read.
 */

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  envState: {
    SILPO_ENABLED: true,
    PUBLIC_API_BASE_URL: "https://api.example.com",
  },
  buildAuthorizationUrl: vi.fn(),
  consumeAuthorizationState: vi.fn(),
  exchangeCode: vi.fn(),
  persistTokens: vi.fn(),
  silpoKeyRing: vi.fn(),
  pullAndSyncReceipts: vi.fn(),
  listReceipts: vi.fn(),
  getReceiptDetail: vi.fn(),
  getWebAppOrigin: vi.fn(),
  previewCart: vi.fn(),
  applyCart: vi.fn(),
  getCart: vi.fn(),
  rateLimitExpress: vi.fn(
    (_opts: { key: string; limit: number; windowMs: number }) =>
      (_req: unknown, _res: unknown, next: () => void) =>
        next(),
  ),
}));

vi.mock("../db.js", () => ({ query: mocks.queryMock }));

vi.mock("../env/env.js", () => ({ env: mocks.envState }));

vi.mock("../auth/verificationMail.js", () => ({
  getWebAppOrigin: mocks.getWebAppOrigin,
}));

vi.mock("../modules/silpo/oauth.js", () => ({
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
  consumeAuthorizationState: mocks.consumeAuthorizationState,
  exchangeCode: mocks.exchangeCode,
}));

vi.mock("../modules/silpo/tokenStore.js", () => ({
  persistTokens: mocks.persistTokens,
  silpoKeyRing: mocks.silpoKeyRing,
}));

vi.mock("../modules/silpo/receipts.js", () => ({
  pullAndSyncReceipts: mocks.pullAndSyncReceipts,
  listReceipts: mocks.listReceipts,
  getReceiptDetail: mocks.getReceiptDetail,
}));

vi.mock("../modules/silpo/cart.js", () => ({
  previewCart: mocks.previewCart,
  applyCart: mocks.applyCart,
  getCart: mocks.getCart,
}));

// Deliberately NOT `vi.importActual` here: the real `http/index.js` barrel
// re-exports `requireSession` from `./requireSession.js`, which imports
// `../auth.js` → the Better Auth Drizzle adapter → `db.js`'s default pool
// export. Pulling that whole graph in just to override 3 functions would
// force this lightweight route test to also mock Better Auth/Drizzle.
// `routes/silpo.ts` only imports these three names from the barrel, so a
// fully-standalone mock is both simpler and correctly scoped.
vi.mock("../http/index.js", () => ({
  rateLimitExpress: mocks.rateLimitExpress,
  setModule: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSession:
    () =>
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const userId = req.get("x-test-user-id");
      if (!userId) {
        res
          .status(401)
          .json({ error: "Потрібна автентифікація", code: "UNAUTHORIZED" });
        return;
      }
      (req as express.Request & { user?: { id: string } }).user = {
        id: userId,
      };
      next();
    },
}));

import { createSilpoRouter } from "./silpo.js";

function appWith(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(createSilpoRouter());
  // Minimal error handler so a thrown AppError doesn't crash supertest —
  // mirrors the shape `obs/errorHandler.ts` emits closely enough for tests.
  app.use(
    (
      err: { status?: number; code?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(err.status ?? 500)
        .json({ error: err.message ?? "error", code: err.code ?? "INTERNAL" });
    },
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.envState.SILPO_ENABLED = true;
  mocks.envState.PUBLIC_API_BASE_URL = "https://api.example.com";
  mocks.queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.getWebAppOrigin.mockReturnValue("https://app.example.com");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SILPO_ENABLED kill switch", () => {
  it.each([
    ["get", "/api/silpo/connect"],
    ["get", "/api/silpo/callback"],
    ["post", "/api/silpo/disconnect"],
    ["post", "/api/silpo/wipe"],
    ["get", "/api/silpo/sync-state"],
    ["post", "/api/silpo/sync"],
    ["get", "/api/silpo/receipts"],
    ["get", "/api/silpo/receipts/r1"],
    ["post", "/api/silpo/cart/preview"],
    ["post", "/api/silpo/cart/apply"],
    ["get", "/api/silpo/cart"],
  ] as const)(
    "returns 503 SILPO_DISABLED for %s %s when disabled",
    async (method, path) => {
      mocks.envState.SILPO_ENABLED = false;
      const res = await request(appWith())
        [method](path)
        .set("x-test-user-id", "user-1");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ code: "SILPO_DISABLED" });
    },
  );
});

describe("rate-limit keys", () => {
  it("registers a distinct bucket per cart route (CodeQL 'missing rate limiting' pattern)", () => {
    appWith(); // createSilpoRouter() registers every route synchronously
    const keys = mocks.rateLimitExpress.mock.calls.map(([opts]) => opts.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "api:silpo:cart-preview",
        "api:silpo:cart-apply",
        "api:silpo:cart-get",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length); // every key unique

    const byKey = new Map(
      mocks.rateLimitExpress.mock.calls.map(([opts]) => [opts.key, opts]),
    );
    expect(byKey.get("api:silpo:cart-preview")).toMatchObject({
      limit: 10,
      windowMs: 60_000,
    });
    // Apply writes to an external system — the tightest bucket.
    expect(byKey.get("api:silpo:cart-apply")).toMatchObject({
      limit: 5,
      windowMs: 60_000,
    });
    expect(byKey.get("api:silpo:cart-get")).toMatchObject({
      limit: 30,
      windowMs: 60_000,
    });
  });
});

describe("session guard", () => {
  it("rejects unauthenticated requests with 401 before touching the DB", async () => {
    const res = await request(appWith()).get("/api/silpo/sync-state");
    expect(res.status).toBe(401);
    expect(mocks.queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/silpo/connect", () => {
  it("redirects to the Silpo authorization URL", async () => {
    mocks.buildAuthorizationUrl.mockResolvedValue({
      url: "https://auth.silpo.ua/authorize?state=abc",
      state: "abc",
    });

    const res = await request(appWith())
      .get("/api/silpo/connect")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      "https://auth.silpo.ua/authorize?state=abc",
    );
    expect(mocks.buildAuthorizationUrl).toHaveBeenCalledWith({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
    });
  });

  it("503s when PUBLIC_API_BASE_URL is not configured", async () => {
    mocks.envState.PUBLIC_API_BASE_URL = "";
    const res = await request(appWith())
      .get("/api/silpo/connect")
      .set("x-test-user-id", "user-1");
    expect(res.status).toBe(503);
    expect(mocks.buildAuthorizationUrl).not.toHaveBeenCalled();
  });
});

describe("GET /api/silpo/callback", () => {
  it("redirects to Settings with ?silpo=connected on a full happy path", async () => {
    mocks.consumeAuthorizationState.mockReturnValue({
      userId: "user-1",
      codeVerifier: "verifier",
      redirectUri: "https://api.example.com/api/silpo/callback",
    });
    mocks.silpoKeyRing.mockReturnValue({ current: { version: 1 } });
    mocks.exchangeCode.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
    });

    const res = await request(appWith())
      .get("/api/silpo/callback?code=abc&state=xyz")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      "https://app.example.com/settings?silpo=connected",
    );
    expect(mocks.persistTokens).toHaveBeenCalledWith(
      "user-1",
      { current: { version: 1 } },
      expect.objectContaining({ accessToken: "at", refreshToken: "rt" }),
    );
  });

  it("redirects with ?silpo=error&reason=invalid_state when state is unknown/replayed", async () => {
    mocks.consumeAuthorizationState.mockReturnValue(null);

    const res = await request(appWith())
      .get("/api/silpo/callback?code=abc&state=bogus")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      "https://app.example.com/settings?silpo=error&reason=invalid_state",
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("rejects a state issued for a different user", async () => {
    mocks.consumeAuthorizationState.mockReturnValue({
      userId: "someone-else",
      codeVerifier: "verifier",
      redirectUri: "https://api.example.com/api/silpo/callback",
    });

    const res = await request(appWith())
      .get("/api/silpo/callback?code=abc&state=xyz")
      .set("x-test-user-id", "user-1");

    expect(res.headers["location"]).toBe(
      "https://app.example.com/settings?silpo=error&reason=invalid_state",
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });
});

describe("POST /api/silpo/disconnect", () => {
  it("deletes only silpo_connection and returns { ok: true }", async () => {
    const res = await request(appWith())
      .post("/api/silpo/disconnect")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.queryMock).toHaveBeenCalledWith(
      "DELETE FROM silpo_connection WHERE user_id = $1",
      ["user-1"],
      expect.anything(),
    );
  });
});

describe("POST /api/silpo/wipe", () => {
  it("deletes silpo_receipts and reports the deleted count", async () => {
    mocks.queryMock.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const res = await request(appWith())
      .post("/api/silpo/wipe")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deletedReceipts: 3 });
    expect(mocks.queryMock).toHaveBeenCalledWith(
      "DELETE FROM silpo_receipts WHERE user_id = $1",
      ["user-1"],
      expect.anything(),
    );
  });
});

describe("GET /api/silpo/sync-state", () => {
  it("reports disconnected when there is no connection row", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // connection
      .mockResolvedValueOnce({
        rows: [{ count: "0" }],
        rowCount: 1,
      }); // receipts count

    const res = await request(appWith())
      .get("/api/silpo/sync-state")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 0,
    });
  });

  it("reports connected status with receipt counts", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: "connected",
            access_token_expires_at: "2026-08-17T10:00:00.000Z",
            last_sync_at: "2026-08-17T09:00:00.000Z",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ count: "5" }],
        rowCount: 1,
      });

    const res = await request(appWith())
      .get("/api/silpo/sync-state")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "connected",
      accessTokenExpiresAt: "2026-08-17T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:00:00.000Z",
      receiptsCount: 5,
    });
  });
});

describe("POST /api/silpo/sync", () => {
  it("returns the sync summary on success", async () => {
    mocks.pullAndSyncReceipts.mockResolvedValue({
      status: "connected",
      offlinePulled: 2,
      onlinePulled: 1,
      receiptsInserted: 3,
      itemsInserted: 10,
      matched: 1,
      ambiguous: 0,
      unmatched: 2,
    });

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "connected", matched: 1 });
    expect(mocks.pullAndSyncReceipts).toHaveBeenCalledWith("user-1");
  });

  it("propagates a thrown AppError's status/code to the client", async () => {
    mocks.pullAndSyncReceipts.mockRejectedValue(
      Object.assign(new Error("Сільпо не підключено"), {
        status: 409,
        code: "SILPO_NOT_CONNECTED",
      }),
    );

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "SILPO_NOT_CONNECTED" });
  });
});

describe("GET /api/silpo/receipts", () => {
  it("returns the paginated list", async () => {
    mocks.listReceipts.mockResolvedValue({
      data: [
        {
          receiptId: "r1",
          purchasedAt: "2026-08-17T10:00:00.000Z",
          storeId: "store-1",
          channel: "offline",
          paymentHint: null,
          totalKop: 12345,
          transactionId: null,
        },
      ],
      nextCursor: null,
    });

    const res = await request(appWith())
      .get("/api/silpo/receipts")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      receiptId: "r1",
      totalKop: 12345,
    });
    expect(mocks.listReceipts).toHaveBeenCalledWith("user-1", {
      limit: 50,
      cursor: undefined,
    });
  });
});

describe("GET /api/silpo/receipts/:id", () => {
  it("returns 404 when the receipt does not exist / isn't owned by the user", async () => {
    mocks.getReceiptDetail.mockResolvedValue(null);

    const res = await request(appWith())
      .get("/api/silpo/receipts/missing")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(404);
  });

  it("returns the receipt with items", async () => {
    mocks.getReceiptDetail.mockResolvedValue({
      receiptId: "r1",
      purchasedAt: "2026-08-17T10:00:00.000Z",
      storeId: null,
      channel: "online",
      paymentHint: null,
      totalKop: 500,
      transactionId: "tx-1",
      items: [
        {
          id: 1,
          name: "Молоко",
          qty: 1,
          unit: "шт",
          priceKop: 500,
          categorySlug: null,
          barcode: null,
        },
      ],
    });

    const res = await request(appWith())
      .get("/api/silpo/receipts/r1")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ id: 1, priceKop: 500 });
  });
});

// ────────────────────────────────── Cart (Track G) ──────────────────────────

describe("POST /api/silpo/cart/preview", () => {
  it("returns the search results on a happy path", async () => {
    mocks.previewCart.mockResolvedValue([
      {
        query: "молоко",
        matches: [
          {
            lagerId: "opaque-token-1",
            name: "Молоко 2.5%",
            priceKop: 4500,
            unit: "мл",
            displayRatio: "900мл",
          },
        ],
        unmatched: false,
      },
    ]);

    const res = await request(appWith())
      .post("/api/silpo/cart/preview")
      .set("x-test-user-id", "user-1")
      .send({ items: [{ name: "молоко" }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [
        {
          query: "молоко",
          matches: [
            {
              lagerId: "opaque-token-1",
              name: "Молоко 2.5%",
              priceKop: 4500,
              unit: "мл",
              displayRatio: "900мл",
            },
          ],
          unmatched: false,
        },
      ],
    });
    expect(mocks.previewCart).toHaveBeenCalledWith("user-1", [
      { name: "молоко" },
    ]);
  });

  it("400s on an empty items array", async () => {
    const res = await request(appWith())
      .post("/api/silpo/cart/preview")
      .set("x-test-user-id", "user-1")
      .send({ items: [] });

    expect(res.status).toBe(400);
    expect(mocks.previewCart).not.toHaveBeenCalled();
  });

  it("400s on a whitespace-only item name", async () => {
    const res = await request(appWith())
      .post("/api/silpo/cart/preview")
      .set("x-test-user-id", "user-1")
      .send({ items: [{ name: "   " }] });

    expect(res.status).toBe(400);
    expect(mocks.previewCart).not.toHaveBeenCalled();
  });

  it("400s past 100 items", async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      name: `товар-${i}`,
    }));
    const res = await request(appWith())
      .post("/api/silpo/cart/preview")
      .set("x-test-user-id", "user-1")
      .send({ items });

    expect(res.status).toBe(400);
    expect(mocks.previewCart).not.toHaveBeenCalled();
  });

  it("propagates a thrown AppError's status/code to the client", async () => {
    mocks.previewCart.mockRejectedValue(
      Object.assign(new Error("Сільпо не підключено"), {
        status: 409,
        code: "SILPO_NOT_CONNECTED",
      }),
    );

    const res = await request(appWith())
      .post("/api/silpo/cart/preview")
      .set("x-test-user-id", "user-1")
      .send({ items: [{ name: "молоко" }] });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "SILPO_NOT_CONNECTED" });
  });
});

describe("POST /api/silpo/cart/apply", () => {
  it("adds exactly the passed selections and returns the post-write cart", async () => {
    mocks.applyCart.mockResolvedValue({
      items: [
        { name: "Молоко", quantity: 2, priceKop: 4500, subtotalKop: 9000 },
      ],
      totalKop: 9000,
      cartUrl: "https://silpo.ua/checkout/1",
    });

    const res = await request(appWith())
      .post("/api/silpo/cart/apply")
      .set("x-test-user-id", "user-1")
      .send({ selections: [{ lagerId: "opaque-token-1", quantity: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        { name: "Молоко", quantity: 2, priceKop: 4500, subtotalKop: 9000 },
      ],
      totalKop: 9000,
      cartUrl: "https://silpo.ua/checkout/1",
    });
    expect(mocks.applyCart).toHaveBeenCalledWith("user-1", [
      { lagerId: "opaque-token-1", quantity: 2 },
    ]);
  });

  it("400s on an empty selections array — never calls applyCart", async () => {
    const res = await request(appWith())
      .post("/api/silpo/cart/apply")
      .set("x-test-user-id", "user-1")
      .send({ selections: [] });

    expect(res.status).toBe(400);
    expect(mocks.applyCart).not.toHaveBeenCalled();
  });

  it("400s on a non-positive quantity", async () => {
    const res = await request(appWith())
      .post("/api/silpo/cart/apply")
      .set("x-test-user-id", "user-1")
      .send({ selections: [{ lagerId: "opaque-token-1", quantity: 0 }] });

    expect(res.status).toBe(400);
    expect(mocks.applyCart).not.toHaveBeenCalled();
  });

  it("propagates a mapped 400 ValidationError for a malformed lagerId", async () => {
    mocks.applyCart.mockRejectedValue(
      Object.assign(new Error("Некоректний ідентифікатор товару Сільпо"), {
        status: 400,
        code: "VALIDATION",
      }),
    );

    const res = await request(appWith())
      .post("/api/silpo/cart/apply")
      .set("x-test-user-id", "user-1")
      .send({ selections: [{ lagerId: "garbage", quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION" });
  });
});

describe("GET /api/silpo/cart", () => {
  it("returns the current cart state", async () => {
    mocks.getCart.mockResolvedValue({
      items: [],
      totalKop: 0,
      cartUrl: null,
    });

    const res = await request(appWith())
      .get("/api/silpo/cart")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], totalKop: 0, cartUrl: null });
    expect(mocks.getCart).toHaveBeenCalledWith("user-1");
  });

  it("propagates a mapped upstream-unavailable AppError as 502", async () => {
    mocks.getCart.mockRejectedValue(
      Object.assign(new Error("Сільпо тимчасово недоступний"), {
        status: 502,
        code: "SILPO_UPSTREAM_ERROR",
      }),
    );

    const res = await request(appWith())
      .get("/api/silpo/cart")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: "SILPO_UPSTREAM_ERROR" });
  });
});
