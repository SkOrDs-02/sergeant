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
    // Читає РЕАЛЬНИЙ `getWebAppOrigin()` — див. коментар біля його імпорту.
    WEB_APP_URL: "https://app.example.com",
  },
  buildAuthorizationUrl: vi.fn(),
  consumeAuthorizationState: vi.fn(),
  exchangeCode: vi.fn(),
  persistTokens: vi.fn(),
  silpoKeyRing: vi.fn(),
  pullAndSyncReceipts: vi.fn(),
  diagnoseSilpo: vi.fn(),
  listReceipts: vi.fn(),
  getReceiptDetail: vi.fn(),
  unlinkReceiptFromTransaction: vi.fn(),
  relinkReceiptToTransaction: vi.fn(),
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

// `../auth/verificationMail.js` НЕ мокаємо навмисно. Він імпортує рівно
// один модуль — `env/env.js`, уже застабаний вище, — а `getWebAppOrigin()`
// зводиться до читання `WEB_APP_URL`. Стаб тут нічого не ізолював би, зате
// ховав би резолв origin-а, на який спирається редирект OAuth-колбека.
// Знято ще й тому, що гейт `check-vi-mock-cap` ходить лише вниз: щоб
// додати потрібний мок `diagnose.js`, треба зняти зайвий.

vi.mock("../modules/silpo/diagnose.js", () => ({
  diagnoseSilpo: mocks.diagnoseSilpo,
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
  unlinkReceiptFromTransaction: mocks.unlinkReceiptFromTransaction,
  relinkReceiptToTransaction: mocks.relinkReceiptToTransaction,
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
// `routes/silpo.ts` only imports these four names from the barrel, so a
// fully-standalone mock is both simpler and correctly scoped.
vi.mock("../http/index.js", () => ({
  rateLimitExpress: mocks.rateLimitExpress,
  setModule: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  // Стенд-ін для `optionalSession()`: так само ЧИТАЄ сесію (заголовок
  // `x-test-user-id` = «браузер має сесію на цьому хості»), але ніколи не 401.
  optionalSession:
    () => (req: express.Request, _res: express.Response, next: () => void) => {
      const userId = req.get("x-test-user-id");
      if (userId) {
        (req as express.Request & { user?: { id: string } }).user = {
          id: userId,
        };
      }
      next();
    },
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
import { AppError, ExternalServiceError } from "../obs/errors.js";
import { logger } from "../obs/logger.js";
import {
  SILPO_OAUTH_BINDING_COOKIE,
  hashStateForBinding,
} from "../modules/silpo/oauthBinding.js";

/** Заголовок `Cookie`, який браузер, що зробив `/connect` з цим state, поверне на колбек. */
function bindingCookie(state: string): string {
  return `${SILPO_OAUTH_BINDING_COOKIE}=${hashStateForBinding(state)}`;
}

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
    ["delete", "/api/silpo/receipts/link/tx-1"],
    ["post", "/api/silpo/receipts/link/tx-1"],
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

  it("sec-15: ставить HttpOnly SameSite=Lax куку-привʼязку зі sha256(state)", async () => {
    mocks.buildAuthorizationUrl.mockResolvedValue({
      url: "https://auth.silpo.ua/authorize?state=abc",
      state: "abc",
    });

    const res = await request(appWith())
      .get("/api/silpo/connect")
      .set("x-test-user-id", "user-1");

    const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const binding = setCookie.find((c) =>
      c.startsWith(`${SILPO_OAUTH_BINDING_COOKIE}=`),
    );
    expect(binding).toBeDefined();
    expect(binding).toContain(`=${hashStateForBinding("abc")};`);
    expect(binding).toContain("HttpOnly");
    expect(binding).toContain("SameSite=Lax");
    expect(binding).toContain("Path=/api/silpo/callback");
    expect(binding).toContain("Secure"); // callback-URL у тесті https
    expect(binding).toMatch(/Max-Age=600/);
    // Сам state у куку НЕ потрапляє (він bearer-секрет flow).
    expect(binding).not.toContain("=abc;");
  });

  it("fail-loud: /connect із хоста, до якого колбек не дістанеться, логує error silpo_connect_host_mismatch", async () => {
    mocks.buildAuthorizationUrl.mockResolvedValue({
      url: "https://auth.silpo.ua/authorize?state=abc",
      state: "abc",
    });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await request(appWith())
      .get("/api/silpo/connect")
      .set("Host", "api.other-host.example")
      .set("x-test-user-id", "user-1");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "silpo_connect_host_mismatch" }),
    );

    errorSpy.mockClear();
    await request(appWith())
      .get("/api/silpo/connect")
      .set("Host", "api.example.com")
      .set("x-test-user-id", "user-1");
    await request(appWith())
      .get("/api/silpo/connect")
      .set("Host", "internal:3000")
      .set("X-Forwarded-Host", "app.example.com")
      .set("x-test-user-id", "user-1");
    expect(errorSpy).not.toHaveBeenCalled();
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

function primePending(userId: string): void {
  mocks.consumeAuthorizationState.mockResolvedValue({
    userId,
    codeVerifier: "verifier",
    redirectUri: "https://api.example.com/api/silpo/callback",
  });
  mocks.silpoKeyRing.mockReturnValue({ current: { version: 1 } });
  mocks.exchangeCode.mockResolvedValue({
    access_token: "at",
    refresh_token: "rt",
    expires_in: 3600,
  });
}

const SETTINGS_ERROR = "https://app.example.com/settings?silpo=error";

describe("GET /api/silpo/callback", () => {
  it("redirects to Settings with ?silpo=connected on a full happy path", async () => {
    primePending("user-1");

    const res = await request(appWith())
      .get("/api/silpo/callback?code=abc&state=xyz")
      .set("Cookie", bindingCookie("xyz"))
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
    mocks.consumeAuthorizationState.mockResolvedValue(null);

    const res = await request(appWith())
      .get("/api/silpo/callback?code=abc&state=bogus")
      .set("Cookie", bindingCookie("bogus"))
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      `${SETTINGS_ERROR}&reason=invalid_state`,
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("?error= від Сільпо при наявній сесії -> reason=denied, state не споживається", async () => {
    const res = await request(appWith())
      .get("/api/silpo/callback?error=access_denied&state=xyz")
      .set("x-test-user-id", "user-1");

    expect(res.headers["location"]).toBe(`${SETTINGS_ERROR}&reason=denied`);
    expect(mocks.consumeAuthorizationState).not.toHaveBeenCalled();
  });

  it("роут не 401-ить без сесії (інцидент 2026-08-25): віддає 302, а не JSON", async () => {
    // Регресія на прод-інцидент 2026-08-25: поки роут стояв під router-level
    // requireSession(), кожен тестер отримував 401-JSON у вкладку замість
    // екрана налаштувань. Тест НАВМИСНО не шле x-test-user-id: рівно так
    // поводиться браузер, що повертається з auth.silpo.ua на api-хост.
    const res = await request(appWith()).get(
      "/api/silpo/callback?code=abc&state=xyz",
    );
    expect(res.status).toBe(302);
  });

  it("решта роутів сесію ВИМАГАЄ — виняток лише для callback", async () => {
    const res = await request(appWith()).get("/api/silpo/sync-state");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("GET /api/silpo/callback: relay на хост сесії", () => {
  it("без сесії на api-хості -> 302 на веб-origin з тим самим шляхом і маркером, нічого не споживається", async () => {
    const res = await request(appWith()).get(
      "/api/silpo/callback?code=abc&state=xyz&evil=1",
    );

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      "https://app.example.com/api/silpo/callback?code=abc&state=xyz&silpo_relay=1",
    );
    expect(mocks.consumeAuthorizationState).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("?error= без сесії теж relay-иться (відмову покаже хост сесії)", async () => {
    const res = await request(appWith()).get(
      "/api/silpo/callback?error=access_denied&state=xyz",
    );
    expect(res.headers["location"]).toBe(
      "https://app.example.com/api/silpo/callback?state=xyz&error=access_denied&silpo_relay=1",
    );
  });

  it("повторний прихід без сесії (маркер є) -> session_expired, БЕЗ другого relay (немає циклу)", async () => {
    primePending("user-1");

    const res = await request(appWith()).get(
      "/api/silpo/callback?code=abc&state=xyz&silpo_relay=1",
    );

    expect(res.headers["location"]).toBe(
      `${SETTINGS_ERROR}&reason=session_expired`,
    );
    expect(mocks.consumeAuthorizationState).not.toHaveBeenCalled();
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("api-хост і веб-origin збігаються -> relay не потрібен: session_expired одразу", async () => {
    const prev = mocks.envState.WEB_APP_URL;
    mocks.envState.WEB_APP_URL = "https://api.example.com";
    try {
      const res = await request(appWith()).get(
        "/api/silpo/callback?code=abc&state=xyz",
      );
      expect(res.headers["location"]).toBe(
        "https://api.example.com/settings?silpo=error&reason=session_expired",
      );
    } finally {
      mocks.envState.WEB_APP_URL = prev;
    }
  });
});

describe("GET /api/silpo/callback: sec-15, власник токенів = сесія браузера", () => {
  it("атакер пересилає жертві СВІЙ authorize-URL: сесія жертви + валідний state, але без куки -> invalid_state, токени НЕ збережено", async () => {
    primePending("attacker");

    const res = await request(appWith())
      .get("/api/silpo/callback?code=victim-code&state=xyz")
      .set("x-test-user-id", "victim");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      `${SETTINGS_ERROR}&reason=invalid_state`,
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("навіть з кукою, але сесія НЕ власник state -> invalid_state, code жертви не обмінюється, токени НЕ збережено", async () => {
    // Ізолює шар «сесія»: без звірки pending.userId з сесією токени жертви
    // лягли б на "attacker" (власника state).
    primePending("attacker");

    const res = await request(appWith())
      .get("/api/silpo/callback?code=victim-code&state=xyz")
      .set("Cookie", bindingCookie("xyz"))
      .set("x-test-user-id", "victim");

    expect(res.headers["location"]).toBe(
      `${SETTINGS_ERROR}&reason=invalid_state`,
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("жертва без сесії: relay, а на хості сесії (маркер) -> session_expired, токени НЕ збережено", async () => {
    primePending("attacker");

    const relayed = await request(appWith()).get(
      "/api/silpo/callback?code=victim-code&state=xyz",
    );
    const relayUrl = new URL(String(relayed.headers["location"]));
    expect(relayUrl.origin).toBe("https://app.example.com");

    const res = await request(appWith()).get(
      `${relayUrl.pathname}${relayUrl.search}`,
    );
    expect(res.headers["location"]).toBe(
      `${SETTINGS_ERROR}&reason=session_expired`,
    );
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("кука від ІНШОГО state -> invalid_state, токени НЕ збережено, state не споживається", async () => {
    primePending("user-1");

    const res = await request(appWith())
      .get("/api/silpo/callback?code=victim-code&state=xyz")
      .set("Cookie", bindingCookie("other-flow"))
      .set("x-test-user-id", "user-1");

    expect(res.headers["location"]).toBe(
      `${SETTINGS_ERROR}&reason=invalid_state`,
    );
    expect(mocks.consumeAuthorizationState).not.toHaveBeenCalled();
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("сторонні cookie поруч і сміттєве значення привʼязки -> відмова", async () => {
    primePending("user-1");

    const res = await request(appWith())
      .get("/api/silpo/callback?code=victim-code&state=xyz")
      .set("Cookie", `a=b; ${SILPO_OAUTH_BINDING_COOKIE}=garbage; c=d`)
      .set("x-test-user-id", "user-1");

    expect(res.headers["location"]).toContain("reason=invalid_state");
    expect(mocks.persistTokens).not.toHaveBeenCalled();
  });

  it("ДВА ХОСТИ (прод-топологія): кука й сесія на веб-хості, колбек на api-хості -> relay -> connected", async () => {
    // Регресія на зауваження ревʼю: кука без Domain host-only, тож до
    // api-хоста (PUBLIC_API_BASE_URL) вона не доїде. Тест моделює два хости
    // двома запитами: «api-хост» бачить лише те, що браузер до нього шле
    // (host-only кука й сесія веб-хоста туди НЕ їдуть), «веб-хост» бачить куку й
    // сесію.
    mocks.buildAuthorizationUrl.mockResolvedValue({
      url: "https://auth.silpo.ua/authorize?state=roundtrip",
      state: "roundtrip",
    });
    const connect = await request(appWith())
      .get("/api/silpo/connect")
      .set("x-test-user-id", "user-1");
    const setCookie = ([] as string[]).concat(
      connect.headers["set-cookie"] ?? [],
    );
    const rawCookie = setCookie[0] ?? "";
    expect(rawCookie).not.toMatch(/;\s*Domain=/i); // host-only: на api-хост не поїде
    const cookieHeader = rawCookie.split(";")[0] ?? "";

    primePending("user-1");

    // 1) Сільпо повертає браузер на api-хост: ні куки, ні сесії.
    const apiHost = await request(appWith()).get(
      "/api/silpo/callback?code=abc&state=roundtrip",
    );
    expect(apiHost.status).toBe(302);
    const relayUrl = new URL(String(apiHost.headers["location"]));
    expect(relayUrl.origin).toBe("https://app.example.com");
    expect(mocks.persistTokens).not.toHaveBeenCalled();

    // 2) Браузер йде на веб-хост (Vercel-проксі): тут і кука, і сесія.
    const webHost = await request(appWith())
      .get(`${relayUrl.pathname}${relayUrl.search}`)
      .set("Cookie", cookieHeader)
      .set("x-test-user-id", "user-1");

    expect(webHost.headers["location"]).toBe(
      "https://app.example.com/settings?silpo=connected",
    );
    expect(mocks.persistTokens).toHaveBeenCalledWith(
      "user-1",
      expect.anything(),
      expect.anything(),
    );
    const cleared = ([] as string[])
      .concat(webHost.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith(`${SILPO_OAUTH_BINDING_COOKIE}=;`));
    expect(cleared).toBeDefined();
    expect(cleared).toContain("Path=/api/silpo/callback");
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
      lastFailedAt: null,
      lastErrorCode: null,
      receiptsCount: 0,
      pantryAutoImportSince: null,
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
            last_failed_at: null,
            last_error_code: null,
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
      lastFailedAt: null,
      lastErrorCode: null,
      receiptsCount: 5,
      pantryAutoImportSince: null,
    });
  });

  // Головний кейс усієї правки: доти сервер не мав ЧИМ розповісти про
  // поломку, і зламаний синк був на вигляд не відрізнити від «нових чеків
  // не було». Тепер провал приїжджає окремими полями.
  it("віддає слід останнього провалу, коли синк зламаний", async () => {
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: "connected",
            access_token_expires_at: "2026-09-14T10:00:00.000Z",
            last_sync_at: "2026-08-31T09:00:00.000Z",
            last_failed_at: "2026-09-14T08:00:00.000Z",
            last_error_code: "SILPO_TOOL_ERROR",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ count: "12" }], rowCount: 1 });

    const res = await request(appWith())
      .get("/api/silpo/sync-state")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "connected",
      lastSyncAt: "2026-08-31T09:00:00.000Z",
      lastFailedAt: "2026-09-14T08:00:00.000Z",
      lastErrorCode: "SILPO_TOOL_ERROR",
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
      new AppError("Сільпо не підключено", {
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
          pantryClaimedCount: 0,
          pantryAutoDeclined: false,
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
      transactionId: undefined,
    });
  });

  it("passes transactionId through to the read layer", async () => {
    mocks.listReceipts.mockResolvedValue({ data: [], nextCursor: null });

    const res = await request(appWith())
      .get("/api/silpo/receipts?transactionId=tx-42&limit=1")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(mocks.listReceipts).toHaveBeenCalledWith("user-1", {
      limit: 1,
      cursor: undefined,
      transactionId: "tx-42",
    });
  });
});

describe("DELETE /api/silpo/receipts/link/:transactionId", () => {
  it("знімає звʼязок і віддає ok", async () => {
    mocks.unlinkReceiptFromTransaction.mockResolvedValue("r-1");

    const res = await request(appWith())
      .delete("/api/silpo/receipts/link/tx-1")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    // `receiptId` у відповіді — не діагностика: із нього клієнт збирає
    // «Повернути». Без нього скасувати дію було б нічим.
    expect(res.body).toEqual({ ok: true, receiptId: "r-1" });
    expect(mocks.unlinkReceiptFromTransaction).toHaveBeenCalledWith(
      "user-1",
      "tx-1",
    );
  });

  it("404, коли звʼязку не було — не мовчазний успіх", async () => {
    // Інакше кнопка «відвʼязати» рапортувала б перемогу над уже знятим
    // або чужим звʼязком.
    mocks.unlinkReceiptFromTransaction.mockResolvedValue(null);

    const res = await request(appWith())
      .delete("/api/silpo/receipts/link/tx-missing")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("передає ЛИШЕ id сесії, не довіряючи тілу запиту", async () => {
    mocks.unlinkReceiptFromTransaction.mockResolvedValue("r-1");

    await request(appWith())
      .delete("/api/silpo/receipts/link/tx-1")
      .set("x-test-user-id", "user-1")
      .send({ userId: "user-2" });

    expect(mocks.unlinkReceiptFromTransaction).toHaveBeenCalledWith(
      "user-1",
      "tx-1",
    );
  });
});

describe("POST /api/silpo/receipts/link/:transactionId", () => {
  it("повертає пару назад", async () => {
    mocks.relinkReceiptToTransaction.mockResolvedValue(true);

    const res = await request(appWith())
      .post("/api/silpo/receipts/link/tx-1")
      .set("x-test-user-id", "user-1")
      .send({ receiptId: "r-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.relinkReceiptToTransaction).toHaveBeenCalledWith(
      "user-1",
      "tx-1",
      "r-1",
    );
  });

  it("404, коли чек не належить користувачу", async () => {
    // Ендпоїнт приймає будь-який `receiptId`, тож перевірка власності —
    // єдине, що стоїть між ним і привʼязкою чужого чека.
    mocks.relinkReceiptToTransaction.mockResolvedValue(false);

    const res = await request(appWith())
      .post("/api/silpo/receipts/link/tx-1")
      .set("x-test-user-id", "user-1")
      .send({ receiptId: "not-mine" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("400 без receiptId у тілі", async () => {
    const res = await request(appWith())
      .post("/api/silpo/receipts/link/tx-1")
      .set("x-test-user-id", "user-1")
      .send({});

    expect(res.status).toBe(400);
    expect(mocks.relinkReceiptToTransaction).not.toHaveBeenCalled();
  });

  it("бере власника з сесії, ігноруючи тіло запиту", async () => {
    mocks.relinkReceiptToTransaction.mockResolvedValue(true);

    await request(appWith())
      .post("/api/silpo/receipts/link/tx-1")
      .set("x-test-user-id", "user-1")
      .send({ receiptId: "r-1", userId: "user-2" });

    expect(mocks.relinkReceiptToTransaction).toHaveBeenCalledWith(
      "user-1",
      "tx-1",
      "r-1",
    );
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
      pantryClaimedCount: 0,
      pantryAutoDeclined: false,
      items: [
        {
          id: 1,
          name: "Молоко",
          qty: 1,
          unit: "шт",
          priceKop: 500,
          categorySlug: null,
          barcode: null,
          pantryClaimedAt: null,
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
            oldPriceKop: null,
            available: true,
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
              oldPriceKop: null,
              available: true,
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

/**
 * Звіт власника 2026-09-13: «пише все одно, що змінили формат». Копія
 * описує симптом, причина лишалась у лозі. Тепер синк доганяє діагноз і
 * дописує його в ту саму плашку, яку людина вже бачить.
 */
describe("POST /api/silpo/sync — причина в тексті помилки", () => {
  // Саме `ExternalServiceError`, а не Object.assign-підробка: гард у
  // `withSyncDiagnosis` перевіряє `instanceof AppError`, і тест мусить
  // ходити тим самим типом, яким кидає `silpoErrorToAppError`.
  function driftError(): ExternalServiceError {
    return new ExternalServiceError(
      "Сільпо змінили формат відповіді, оновлення тимчасово недоступне",
      { code: "SILPO_SCHEMA_DRIFT" },
    );
  }

  it("дописує вердикт діагностики до помилки дрейфу", async () => {
    mocks.pullAndSyncReceipts.mockRejectedValue(driftError());
    mocks.diagnoseSilpo.mockResolvedValue({
      verdict:
        "Сільпо прибрали або перейменували тули: silpo_get_my_online_orders.",
    });

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("SILPO_SCHEMA_DRIFT");
    expect(res.body.error).toContain("перейменували тули");
    // Стара загальна копія на діагностованому шляху НЕ зʼявляється: доки
    // вердикт дописувався до неї, «спрацювало» й «не спрацювало» читались
    // однаково (звіт власника 2026-09-13).
    expect(res.body.error).not.toContain("Сільпо змінили формат відповіді");
  });

  it("не ходить по діагноз, коли синк пройшов", async () => {
    mocks.pullAndSyncReceipts.mockResolvedValue({
      status: "connected",
      offlinePulled: 0,
      onlinePulled: 0,
      receiptsInserted: 0,
      itemsInserted: 0,
      matched: 0,
      ambiguous: 0,
      unmatched: 0,
    });

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(200);
    expect(mocks.diagnoseSilpo).not.toHaveBeenCalled();
  });

  it("не чіпає помилки, які й так пояснюють себе", async () => {
    mocks.pullAndSyncReceipts.mockRejectedValue(
      Object.assign(new Error("Сільпо не підключено"), {
        status: 409,
        code: "SILPO_NOT_CONNECTED",
      }),
    );

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.body.error).toBe("Сільпо не підключено");
    expect(mocks.diagnoseSilpo).not.toHaveBeenCalled();
  });

  it("провал діагностики видно в тексті, а не мовчки", async () => {
    mocks.pullAndSyncReceipts.mockRejectedValue(driftError());
    mocks.diagnoseSilpo.mockRejectedValue(new Error("boom"));

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("Діагностика впала: boom");
  });

  it("стан без підключення теж має власний текст", async () => {
    mocks.pullAndSyncReceipts.mockRejectedValue(driftError());
    mocks.diagnoseSilpo.mockResolvedValue({ unavailable: "not_connected" });

    const res = await request(appWith())
      .post("/api/silpo/sync")
      .set("x-test-user-id", "user-1");

    expect(res.body.error).toContain(
      "Причину дізнатись не вдалось: not_connected",
    );
  });

  // Головне твердження цієї групи: ГОЛА стара копія лишається можливою
  // рівно в одному випадку — коли цей код не виконався взагалі. Тому
  // жоден діагностований шлях не має права її віддати.
  it.each([
    ["вердикт", { verdict: "Все справне." }, undefined],
    ["unavailable", { unavailable: "not_connected" }, undefined],
    ["падіння", undefined, new Error("boom")],
  ])(
    "жоден шлях (%s) не віддає голу стару копію",
    async (_case, resolved, rejected) => {
      mocks.pullAndSyncReceipts.mockRejectedValue(driftError());
      if (rejected) mocks.diagnoseSilpo.mockRejectedValue(rejected);
      else mocks.diagnoseSilpo.mockResolvedValue(resolved);

      const res = await request(appWith())
        .post("/api/silpo/sync")
        .set("x-test-user-id", "user-1");

      expect(res.body.error).not.toBe(
        "Сільпо змінили формат відповіді, оновлення тимчасово недоступне",
      );
    },
  );
});
