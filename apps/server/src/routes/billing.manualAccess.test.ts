import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../obs/errors.js";

/**
 * `POST /api/billing/manual-access` (спека manual-premium-request.md): сесія,
 * валідація тіла, спільний бакет rate limit із checkout і проброс 409 у
 * стандартну форму `{error, code, requestId}`. Ядро має власні тести
 * (`modules/billing/manualAccess.test.ts`).
 */

const { getSessionUserMock, requestManualAccessMock, limiterOptions } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn(),
    requestManualAccessMock: vi.fn(),
    limiterOptions: [] as Array<{
      key: string;
      limit: number;
      windowMs: number;
    }>,
  }));

vi.mock("../auth.js", () => ({ getSessionUser: getSessionUserMock }));

vi.mock("../modules/me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../modules/me/dataRights.js")>()),
  getAccountDeletionStatus: vi.fn(async () => ({ pending: false })),
}));

vi.mock("../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("../http/rateLimit.js")>(
    "../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: (opts: {
      key: string;
      limit: number;
      windowMs: number;
    }) => {
      limiterOptions.push(opts);
      return (_req: unknown, _res: unknown, next: () => void) => next();
    },
  };
});

vi.mock("../modules/billing/manualAccess.js", async () => ({
  ...(await vi.importActual<
    typeof import("../modules/billing/manualAccess.js")
  >("../modules/billing/manualAccess.js")),
  requestManualAccess: requestManualAccessMock,
}));

const { createBillingRouter } = await import("./billing.js");
const { errorHandler } = await import("../http/errorHandler.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use(createBillingRouter({ pool: { query: vi.fn() } as never }));
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  getSessionUserMock.mockReset();
  requestManualAccessMock.mockReset();
  getSessionUserMock.mockResolvedValue({
    id: "user-test-1",
    email: "user-test-1@test.local",
  });
});

describe("POST /api/billing/manual-access", () => {
  it("200 { ok, requestedAt } і контекст сторінки в ядро", async () => {
    requestManualAccessMock.mockResolvedValueOnce({
      requestedAt: "2026-11-18T10:00:00.000Z",
    });
    const res = await request(app())
      .post("/api/billing/manual-access")
      .set("User-Agent", "x".repeat(300))
      .send({ surface: "ai_chat_limit", page: "/hub", viewport: "390x844" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      requestedAt: "2026-11-18T10:00:00.000Z",
    });
    const [, userId, ctx] = requestManualAccessMock.mock.calls[0] ?? [];
    expect(userId).toBe("user-test-1");
    expect(ctx).toMatchObject({
      surface: "ai_chat_limit",
      page: "/hub",
      viewport: "390x844",
    });
    expect((ctx as { userAgent: string }).userAgent).toHaveLength(256);
  });

  it("спільний бакет rate limit із checkout", () => {
    limiterOptions.length = 0;
    app();
    // Два лімітери з ключем checkout: сам checkout і запит доступу.
    expect(
      limiterOptions.filter((o) => o.key === "api:billing:checkout"),
    ).toEqual([
      { key: "api:billing:checkout", limit: 10, windowMs: 3_600_000 },
      { key: "api:billing:checkout", limit: 10, windowMs: 3_600_000 },
    ]);
  });

  it.each([
    "MANUAL_ACCESS_ALREADY_REQUESTED",
    "MANUAL_ACCESS_NOT_NEEDED",
    "MANUAL_ACCESS_CLOSED",
  ])("409 %s у стандартній формі помилки", async (code) => {
    requestManualAccessMock.mockRejectedValueOnce(
      new AppError("conflict", { status: 409, code }),
    );
    const res = await request(app())
      .post("/api/billing/manual-access")
      .send({ surface: "week_plan" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(code);
  });

  it("невідома поверхня: 400 без виклику ядра", async () => {
    const res = await request(app())
      .post("/api/billing/manual-access")
      .send({ surface: "pricing_page" });

    expect(res.status).toBe(400);
    expect(requestManualAccessMock).not.toHaveBeenCalled();
  });

  it("без сесії: 401", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);
    const res = await request(app())
      .post("/api/billing/manual-access")
      .send({ surface: "week_plan" });

    expect(res.status).toBe(401);
    expect(requestManualAccessMock).not.toHaveBeenCalled();
  });
});
