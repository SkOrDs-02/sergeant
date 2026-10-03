/**
 * `/api/transcribe` × plan-gate (V1, рішення власника 2026-09-11).
 *
 * ЧОМУ ЦЕ ОКРЕМИЙ ФАЙЛ. `requirePlan` читає `env.STRIPE_ENABLED`, а
 * `env/env.ts` парсить `process.env` РІВНО ОДИН РАЗ при імпорті. Щоб
 * побачити гейт у дії, треба стабнути env і пере-імпортувати модуль із
 * чистого реєстру (`vi.resetModules()`) — той самий патерн, що в
 * `modules/billing/requirePlan.test.ts`. У спільному
 * `cross-domain-routes.contract.test.ts` це неможливо: там десяток
 * hoisted-моків, які скидання реєстру знесло б разом із гейтом.
 *
 * ЧОМУ БЕЗ ЦЬОГО ФАЙЛУ ТЕСТІВ БУЛО НЕ ДОСИТЬ. Перша спроба перевіряла
 * гейт при дефолтному `STRIPE_ENABLED=false` — і мутація «прибрати
 * `requirePlan` з чейну» лишала всі тести зеленими, бо no-op і
 * відсутність middleware поводяться однаково. Тобто тест на гейт сам був
 * рівно тим мовчазним гейтом, від якого гейт і ставили.
 *
 * Last validated: 2026-09-13
 * Status: Active
 */
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getUserPlanMock, getSessionUserMock, transcribeHandlerMock, mockPool } =
  vi.hoisted(() => ({
    getUserPlanMock: vi.fn(),
    getSessionUserMock: vi.fn(),
    transcribeHandlerMock: vi.fn((_req: unknown, res: express.Response) =>
      res.json({ ok: true, text: "hello" }),
    ),
    mockPool: { query: vi.fn(), connect: vi.fn(), on: vi.fn() },
  }));

// Гейт вікна видалення в `requireSession` ходить у глобальний пул за
// міткою; тест його не мокає, тож без заглушки маршрут падав у 500 або
// з'їдав чужі `mockResolvedValueOnce`.
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

vi.mock("../modules/billing/getUserPlan.js", async () => {
  const actual = await vi.importActual<
    typeof import("../modules/billing/getUserPlan.js")
  >("../modules/billing/getUserPlan.js");
  return { ...actual, getUserPlan: getUserPlanMock };
});

vi.mock("../modules/transcribe/transcribe.js", () => ({
  default: transcribeHandlerMock,
}));

async function appWithGate(stripeEnabled: string) {
  vi.stubEnv("STRIPE_ENABLED", stripeEnabled);
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  vi.resetModules();
  const { createTranscribeRouter } = await import("./transcribe.js");
  const app = express();
  app.use(createTranscribeRouter({ pool: mockPool as never }));
  return app;
}

const post = (app: express.Express) =>
  request(app)
    .post("/api/transcribe")
    .set("x-test-user-id", "free-user")
    .set("content-type", "audio/webm")
    .send(Buffer.from("audio"));

describe("/api/transcribe — plan-gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("з увімкненим білінгом free-юзер дістає 402, а не транскрипцію", async () => {
    getSessionUserMock.mockResolvedValue({ id: "free-user" });
    getUserPlanMock.mockResolvedValue({ plan: "free", status: "active" });

    const res = await post(await appWithGate("true"));

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: "PLAN_REQUIRED" });
    // Головне: до Groq справа не дійшла. Гейт, який пускає запит і лише
    // потім скаржиться, коштував би нам грошей за кожен виклик.
    expect(transcribeHandlerMock).not.toHaveBeenCalled();
  });

  it("з увімкненим білінгом Pro-юзер проходить", async () => {
    getSessionUserMock.mockResolvedValue({ id: "pro-user" });
    getUserPlanMock.mockResolvedValue({ plan: "pro", status: "active" });

    const res = await post(await appWithGate("true"));

    expect(res.status).toBe(200);
    expect(transcribeHandlerMock).toHaveBeenCalled();
  });

  /**
   * Фіксуємо чинний стан вголос: сьогодні `STRIPE_ENABLED=false`, і гейт
   * НЕ закриває нічого. Це не баг і не привід його прибрати — він стане
   * чинним у ту саму хвилину, коли ввімкнуть білінг. Але поки так,
   * «ендпоінт доступний в обхід UI» тримає закритим денний USD-cap
   * (`modules/transcribe/usdCap.ts`), а не цей рядок.
   */
  it("з вимкненим білінгом гейт пропускає — і це задокументований стан", async () => {
    getSessionUserMock.mockResolvedValue({ id: "free-user" });
    getUserPlanMock.mockResolvedValue({ plan: "free", status: "active" });

    const res = await post(await appWithGate("false"));

    expect(res.status).toBe(200);
    // План навіть не питали: middleware вийшов до звернення до БД.
    expect(getUserPlanMock).not.toHaveBeenCalled();
  });
});
