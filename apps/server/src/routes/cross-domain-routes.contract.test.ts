import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyBodySizePolicy } from "../http/bodySizePolicy.js";
import { createFoodSearchRouter } from "./food-search.js";
import { createMonoWebhookRouter } from "./mono-webhook.js";
import { createNutritionRouter } from "./nutrition.js";
import { createTranscribeRouter } from "./transcribe.js";
import { createWaitlistRouter } from "./waitlist.js";

vi.setConfig({ testTimeout: 60_000 });

const {
  getSessionUserMock,
  submitWaitlistEntryMock,
  mockPool,
  nutritionHandlers,
  monoHandlers,
  transcribeHandlerMock,
  foodSearchHandlerMock,
} = vi.hoisted(() => {
  const nutritionHandlers = {
    analyzePhoto: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "analyzePhoto" }),
    ),
    parsePantry: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "parsePantry" }),
    ),
    refinePhoto: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "refinePhoto" }),
    ),
    recommendRecipes: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "recommendRecipes" }),
    ),
    dayHint: vi.fn((_req, res) => res.json({ ok: true, handler: "dayHint" })),
    weekPlan: vi.fn((_req, res) => res.json({ ok: true, handler: "weekPlan" })),
    dayPlan: vi.fn((_req, res) => res.json({ ok: true, handler: "dayPlan" })),
    shoppingList: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "shoppingList" }),
    ),
    backupUpload: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "backupUpload" }),
    ),
    backupDownload: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "backupDownload" }),
    ),
  };
  const monoHandlers = {
    connect: vi.fn((_req, res) => res.json({ ok: true, handler: "connect" })),
    disconnect: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "disconnect" }),
    ),
    syncState: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "syncState" }),
    ),
    accounts: vi.fn((_req, res) => res.json({ ok: true, handler: "accounts" })),
    transactions: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "transactions" }),
    ),
    backfill: vi.fn((_req, res) => res.json({ ok: true, handler: "backfill" })),
    backfillProgress: vi.fn((_req, res) =>
      res.json({ ok: true, handler: "backfillProgress" }),
    ),
    webhook: vi.fn((req, res) =>
      res.json({
        ok: true,
        handler: "webhook",
        pathSecret: req.params.secret ?? null,
        headerSecret: req.get("x-mono-webhook-secret") ?? null,
      }),
    ),
  };
  return {
    getSessionUserMock: vi.fn(),
    submitWaitlistEntryMock: vi.fn(),
    mockPool: { query: vi.fn(), connect: vi.fn(), on: vi.fn() },
    nutritionHandlers,
    monoHandlers,
    transcribeHandlerMock: vi.fn((_req, res) =>
      res.json({ ok: true, text: "hello" }),
    ),
    foodSearchHandlerMock: vi.fn((_req, res) =>
      res.json({ ok: true, items: [{ name: "apple" }] }),
    ),
  };
});

vi.mock("../db.js", () => ({
  default: mockPool,
  pool: mockPool,
}));

vi.mock("../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

vi.mock("../modules/waitlist/waitlistService.js", () => ({
  submitWaitlistEntry: submitWaitlistEntryMock,
}));

vi.mock("../modules/nutrition/analyze-photo.js", () => ({
  default: nutritionHandlers.analyzePhoto,
}));
vi.mock("../modules/nutrition/parse-pantry.js", () => ({
  default: nutritionHandlers.parsePantry,
}));
vi.mock("../modules/nutrition/refine-photo.js", () => ({
  default: nutritionHandlers.refinePhoto,
}));
vi.mock("../modules/nutrition/recommend-recipes.js", () => ({
  default: nutritionHandlers.recommendRecipes,
}));
vi.mock("../modules/nutrition/day-hint.js", () => ({
  default: nutritionHandlers.dayHint,
}));
vi.mock("../modules/nutrition/week-plan.js", () => ({
  default: nutritionHandlers.weekPlan,
}));
vi.mock("../modules/nutrition/day-plan.js", () => ({
  default: nutritionHandlers.dayPlan,
}));
vi.mock("../modules/nutrition/shopping-list.js", () => ({
  default: nutritionHandlers.shoppingList,
}));
vi.mock("../modules/nutrition/backup-upload.js", () => ({
  default: nutritionHandlers.backupUpload,
}));
vi.mock("../modules/nutrition/backup-download.js", () => ({
  default: nutritionHandlers.backupDownload,
}));

vi.mock("../modules/mono/connection.js", () => ({
  connectHandler: monoHandlers.connect,
  disconnectHandler: monoHandlers.disconnect,
  syncStateHandler: monoHandlers.syncState,
}));
vi.mock("../modules/mono/read.js", () => ({
  accountsHandler: monoHandlers.accounts,
  transactionsHandler: monoHandlers.transactions,
}));
vi.mock("../modules/mono/backfill.js", () => ({
  backfillHandler: monoHandlers.backfill,
  backfillProgressHandler: monoHandlers.backfillProgress,
}));
vi.mock("../modules/mono/webhook.js", () => ({
  webhookHandler: monoHandlers.webhook,
}));

vi.mock("../modules/transcribe/transcribe.js", () => ({
  default: transcribeHandlerMock,
}));
vi.mock("../modules/nutrition/food-search.js", () => ({
  default: foodSearchHandlerMock,
}));

vi.mock("../http/index.js", async () => {
  const actual =
    await vi.importActual<typeof import("../http/index.js")>(
      "../http/index.js",
    );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
    requireSession:
      () =>
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        const userId = req.get("x-test-user-id");
        if (!userId) {
          res.status(401).json({ ok: false, code: "UNAUTHENTICATED" });
          return;
        }
        res.locals["sessionUser"] = { id: userId };
        next();
      },
    requireVerifiedEmail:
      () =>
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        if (req.get("x-test-email-verified") !== "true") {
          res.status(403).json({
            ok: false,
            code: "EMAIL_VERIFICATION_REQUIRED",
          });
          return;
        }
        next();
      },
    requireAnthropicKey:
      () =>
      (
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        if (!process.env["ANTHROPIC_API_KEY"]) {
          res.status(503).json({ ok: false, code: "ANTHROPIC_KEY_MISSING" });
          return;
        }
        next();
      },
    requireGroqKey:
      () =>
      (
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        if (!process.env["GROQ_API_KEY"]) {
          res.status(503).json({ ok: false, code: "GROQ_KEY_MISSING" });
          return;
        }
        next();
      },
    requireAiQuota: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

function appWith(router: express.Router): express.Express {
  const app = express();
  applyBodySizePolicy(app);
  app.use(router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  getSessionUserMock.mockResolvedValue(null);
  submitWaitlistEntryMock.mockResolvedValue({ created: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nutrition route wiring", () => {
  it.each([
    ["/api/nutrition/analyze-photo", "analyzePhoto"],
    ["/api/nutrition/parse-pantry", "parsePantry"],
    ["/api/nutrition/recommend-recipes", "recommendRecipes"],
    ["/api/nutrition/day-plan", "dayPlan"],
    ["/api/nutrition/week-plan", "weekPlan"],
    ["/api/nutrition/shopping-list", "shoppingList"],
  ])("routes %s through session + AI guards", async (path, handler) => {
    const res = await request(
      appWith(createNutritionRouter({ pool: mockPool as unknown as Pool })),
    )
      .post(path)
      .set("x-test-user-id", "user-1")
      .send({ input: "ok" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, handler });
  });

  it("rejects AI nutrition endpoints without a session before handler work", async () => {
    const res = await request(
      appWith(createNutritionRouter({ pool: mockPool as unknown as Pool })),
    )
      .post("/api/nutrition/analyze-photo")
      .send({ input: "ok" });

    expect(res.status).toBe(401);
    expect(nutritionHandlers.analyzePhoto).not.toHaveBeenCalled();
  });

  it("lets backup upload/download use session without Anthropic quota", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const app = appWith(
      createNutritionRouter({ pool: mockPool as unknown as Pool }),
    );

    await expect(
      request(app)
        .post("/api/nutrition/backup-upload")
        .set("x-test-user-id", "user-1")
        .send({ backup: true }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, handler: "backupUpload" },
    });
    await expect(
      request(app)
        .post("/api/nutrition/backup-download")
        .set("x-test-user-id", "user-1")
        .send({ since: "2026-06-01" }),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true, handler: "backupDownload" },
    });
  });
});

describe("Monobank route wiring", () => {
  it.each([
    ["post", "/api/mono/disconnect", "disconnect"],
    ["get", "/api/mono/sync-state", "syncState"],
    ["get", "/api/mono/accounts", "accounts"],
    ["get", "/api/mono/transactions", "transactions"],
  ] as const)("protects %s %s with session", async (method, path, handler) => {
    const app = appWith(createMonoWebhookRouter());

    const unauthenticated = await request(app)[method](path);
    expect(unauthenticated.status).toBe(401);

    const authed = await request(app)
      [method](path)
      .set("x-test-user-id", "user-1");
    expect(authed.status).toBe(200);
    expect(authed.body).toMatchObject({ ok: true, handler });
  });

  it("starts backfill and reports progress for the session user", async () => {
    const app = appWith(createMonoWebhookRouter());

    const start = await request(app)
      .post("/api/mono/backfill")
      .set("x-test-user-id", "user-1")
      .send({ days: 30 });
    const progress = await request(app)
      .get("/api/mono/backfill-progress")
      .set("x-test-user-id", "user-1");

    expect(start.body).toMatchObject({ ok: true, handler: "backfill" });
    expect(progress.body).toMatchObject({
      ok: true,
      handler: "backfillProgress",
    });
  });

  it("keeps webhook delivery public for header and path secrets", async () => {
    const app = appWith(createMonoWebhookRouter());

    const headerSecret = await request(app)
      .post("/api/mono/webhook")
      .set("x-mono-webhook-secret", "header-secret")
      .send({ data: "payload" });
    const pathSecret = await request(app)
      .post("/api/mono/webhook/path-secret")
      .send({ data: "payload" });

    expect(headerSecret.status).toBe(200);
    expect(headerSecret.body).toMatchObject({
      handler: "webhook",
      pathSecret: null,
      headerSecret: "header-secret",
    });
    expect(pathSecret.status).toBe(200);
    expect(pathSecret.body).toMatchObject({
      handler: "webhook",
      pathSecret: "path-secret",
      headerSecret: null,
    });
  });
});

describe("waitlist route wiring", () => {
  it("accepts anonymous v1 submissions and stores defaulted payload fields", async () => {
    const res = await request(appWith(createWaitlistRouter()))
      .post("/api/v1/waitlist")
      .set("user-agent", "Sergeant QA")
      .send({ email: "USER@EXAMPLE.COM", locale: "UK" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, created: true });
    expect(submitWaitlistEntryMock).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        email: "user@example.com",
        tier_interest: "unsure",
        source: "pricing_page",
        locale: "uk",
        user_id: null,
        user_agent: "Sergeant QA",
      }),
    );
  });

  it("keeps the legacy /api/waitlist alias and treats session lookup failures as anonymous", async () => {
    getSessionUserMock.mockRejectedValueOnce(new Error("auth unavailable"));
    submitWaitlistEntryMock.mockResolvedValueOnce({ created: false });

    const res = await request(appWith(createWaitlistRouter()))
      .post("/api/waitlist")
      .send({ email: "repeat@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, created: false });
    expect(submitWaitlistEntryMock).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ email: "repeat@example.com", user_id: null }),
    );
  });
});

describe("voice and lookup route wiring", () => {
  it("protects audio transcribe with session and Groq availability", async () => {
    const app = appWith(createTranscribeRouter());

    expect(
      await request(app)
        .post("/api/transcribe")
        .set("content-type", "audio/webm")
        .send(Buffer.from("audio")),
    ).toMatchObject({ status: 401 });

    vi.stubEnv("GROQ_API_KEY", "");
    expect(
      await request(app)
        .post("/api/transcribe")
        .set("x-test-user-id", "user-1")
        .set("content-type", "audio/webm")
        .send(Buffer.from("audio")),
    ).toMatchObject({ status: 503 });

    vi.stubEnv("GROQ_API_KEY", "test-groq");
    const ok = await request(app)
      .post("/api/transcribe")
      .set("x-test-user-id", "user-1")
      .set("content-type", "audio/webm")
      .send(Buffer.from("audio"));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, text: "hello" });
  });

  it("serves public food search with stale-while-revalidate cache", async () => {
    const res = await request(appWith(createFoodSearchRouter()))
      .get("/api/food-search")
      .query({ q: "apple" });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=300, stale-while-revalidate=300",
    );
    expect(res.body).toEqual({ ok: true, items: [{ name: "apple" }] });
  });
});
