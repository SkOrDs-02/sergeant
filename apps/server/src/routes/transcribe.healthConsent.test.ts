/**
 * `/api/transcribe` x гейт згоди на дані про здоровʼя (рішення власника
 * 2026-09-30: модуль-тег `?module=`). Тег декларативний: відсутній або
 * невідомий = відкрито, щоб старі клієнти не зламались.
 *
 * Last validated: 2026-09-30
 * Status: Active
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HEALTH_CONSENT_REQUIRED_MESSAGE } from "@sergeant/shared";

const { hasConsentMock, getSessionUserMock, handlerMock, mockPool } =
  vi.hoisted(() => ({
    hasConsentMock: vi.fn(),
    getSessionUserMock: vi.fn(),
    handlerMock: vi.fn((_req: unknown, res: express.Response) =>
      res.json({ text: "ok", durationSec: 1, model: "m" }),
    ),
    mockPool: { query: vi.fn(), connect: vi.fn(), on: vi.fn() },
  }));

vi.mock("../modules/me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../modules/me/dataRights.js")>()),
  getAccountDeletionStatus: vi.fn(async () => ({ pending: false })),
}));
vi.mock("../db.js", () => ({ default: mockPool, pool: mockPool }));
vi.mock("../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));
vi.mock("../modules/ai-memory/consent.js", () => ({
  hasHealthDataConsent: hasConsentMock,
}));
vi.mock("../modules/transcribe/transcribe.js", () => ({
  default: handlerMock,
}));

async function makeApp() {
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  vi.stubEnv("STRIPE_ENABLED", "false");
  vi.resetModules();
  const { createTranscribeRouter } = await import("./transcribe.js");
  const app = express();
  app.use(createTranscribeRouter({ pool: mockPool as never }));
  const { errorHandler } = await import("../http/index.js");
  app.use(errorHandler);
  return app;
}

const post = (app: express.Express, qs = "") =>
  request(app)
    .post(`/api/transcribe${qs}`)
    .set("x-test-user-id", "u1")
    .set("content-type", "audio/webm")
    .send(Buffer.from("audio"));

describe("/api/transcribe - гейт health-модулів", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it.each(["nutrition", "fizruk"])(
    "module=%s без згоди -> 403 HEALTH_CONSENT_REQUIRED, handler (Groq) не викликано",
    async (module) => {
      hasConsentMock.mockResolvedValue(false);
      const res = await post(await makeApp(), `?module=${module}`);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: "HEALTH_CONSENT_REQUIRED",
        error: HEALTH_CONSENT_REQUIRED_MESSAGE,
      });
      expect(handlerMock).not.toHaveBeenCalled();
    },
  );

  it("module=nutrition зі згодою -> 200", async () => {
    hasConsentMock.mockResolvedValue(true);
    const res = await post(await makeApp(), "?module=nutrition");
    expect(res.status).toBe(200);
    expect(handlerMock).toHaveBeenCalled();
  });

  it("збій БД при перевірці = немає згоди (fail-closed)", async () => {
    hasConsentMock.mockRejectedValue(new Error("db down"));
    const res = await post(await makeApp(), "?module=fizruk");
    expect(res.status).toBe(403);
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "?module=finyk",
    "?module=routine",
    "?module=hub",
    "?module=zzz",
  ])(
    "без тегу або non-health/невідомий тег (%s) -> відкрито, згоду не питаємо",
    async (qs) => {
      hasConsentMock.mockResolvedValue(false);
      const res = await post(await makeApp(), qs);
      expect(res.status).toBe(200);
      expect(hasConsentMock).not.toHaveBeenCalled();
    },
  );
});
