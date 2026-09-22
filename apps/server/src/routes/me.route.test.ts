import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract test для `PUT /api/me/profile` — L-8 Фаза 2
 * (2026-08-09, docs/work/specs/audits/2026-08-08-profile-settings-deep-audit.md).
 *
 * Головна гарантія, яку тут перевіряємо end-to-end (не лише юніт-рівнем
 * `profileMirror.test.ts`): дзеркалення `memoryBank` у `ai_memories` —
 * побічний ефект ПІСЛЯ upsert-у профілю, і навіть коли AI-memory-сервіс
 * падає (Voyage circuit open / мережева помилка), сам PUT все одно
 * повертає 200 з уже збереженим профілем (ПАСТКА 4 задачі L-8 Фаза 2).
 */

const {
  mockPool,
  queryMock,
  getSessionUserMock,
  enqueueMock,
  forgetSourceMock,
  verifyPasswordMock,
  requestDeletionMock,
} = vi.hoisted(() => {
  process.env["AI_MEMORY_ENABLED"] = "true";
  const queryMock = vi.fn();
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  const enqueueMock = vi.fn().mockResolvedValue(undefined);
  const forgetSourceMock = vi.fn().mockResolvedValue(undefined);
  const verifyPasswordMock = vi.fn();
  const requestDeletionMock = vi.fn();
  return {
    mockPool,
    queryMock,
    getSessionUserMock,
    enqueueMock,
    forgetSourceMock,
    verifyPasswordMock,
    requestDeletionMock,
  };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  // `requireFreshSession()` (export / DELETE me / bank link) резолвить через
  // fresh-варіант; у цих тестах він поводиться як кешований.
  getFreshSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

// Мокаємо саме ЧЕРГУ, а не `service.remember()`.
//
// `profileMirror.ts` викликає `enqueueMemoryIngest`, і `remember()` за цим
// шляхом досяжний ЛИШЕ через fallback `runDirectDispatch`, який вмикається
// коли немає Redis. Тобто попередня версія цього тесту перевіряла не
// контракт роуту, а випадкову властивість середовища (у CI Redis немає) —
// і на машині з піднятим Redis ті самі перевірки мовчки перестали б щось
// перевіряти: `rememberMock` не викликався б узагалі, а `mockRejectedValue`
// на ньому не дійшов би до межі помилки, яку тест нібито тестує.
vi.mock("./../modules/ai-memory/ingestQueue.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("./../modules/ai-memory/ingestQueue.js")
  >()),
  enqueueMemoryIngest: enqueueMock,
}));

// Шлях видалення акаунта: мокаємо рівно дві його залежності, щоб роут
// лишився справжнім. Сама логіка мітки й скасування покрита
// `modules/me/dataRights.test.ts`, добивання — `deletionPoller.test.ts`;
// тут перевіряється те, чого не покриває НІХТО — гварди самого роуту.
vi.mock("./../modules/me/verifyAccountPassword.js", () => ({
  verifyAccountPassword: verifyPasswordMock,
}));

vi.mock("./../modules/me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../modules/me/dataRights.js")>()),
  requestAccountDeletion: requestDeletionMock,
}));

vi.mock("./../modules/ai-memory/bootstrap.js", () => ({
  getAiMemory: () => ({
    remember: vi.fn().mockResolvedValue(undefined),
    recall: vi.fn().mockResolvedValue([]),
    forgetUser: vi.fn().mockResolvedValue(0),
    forgetSource: forgetSourceMock,
    health: vi.fn().mockResolvedValue({ ok: true, provider: "pgvector" }),
  }),
}));

import { createApp } from "./../app.js";

const SAVED_ENABLED = process.env["AI_MEMORY_ENABLED"];

const STORED_PROFILE = {
  heightCm: 170,
  memoryBank: {
    entries: [
      {
        id: "fact-1",
        fact: "алергія на горіхи",
        category: "allergy",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

/** `upsertUserProfile`'s INSERT ... RETURNING → `profileMirror`'s SELECT existing rows. */
function scriptQueries(
  existingRows: Array<{ source_ref: string | null; content: string }> = [],
) {
  queryMock.mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("INSERT INTO user_profile")) {
      return Promise.resolve({
        rows: [
          {
            payload: STORED_PROFILE,
            updated_at: new Date("2026-08-09T10:00:00.000Z"),
          },
        ],
      });
    }
    if (typeof sql === "string" && sql.includes("FROM ai_memories")) {
      return Promise.resolve({ rows: existingRows });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  queryMock.mockReset();
  scriptQueries();
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: "u1" });
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue(undefined);
  forgetSourceMock.mockReset();
  forgetSourceMock.mockResolvedValue(undefined);
  verifyPasswordMock.mockReset();
  verifyPasswordMock.mockResolvedValue({ ok: true });
  requestDeletionMock.mockReset();
  requestDeletionMock.mockResolvedValue({
    ok: true,
    deletedAt: "2026-09-23T10:00:00.000Z",
    scheduledPurgeAt: "2026-10-23T10:00:00.000Z",
  });
  process.env["AI_MEMORY_ENABLED"] = "true";
});

afterAll(() => {
  if (SAVED_ENABLED === undefined) delete process.env["AI_MEMORY_ENABLED"];
  else process.env["AI_MEMORY_ENABLED"] = SAVED_ENABLED;
});

describe("PUT /api/me/profile — happy path", () => {
  it("зберігає профіль, дзеркалить новий факт у ai_memories, повертає 200", async () => {
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(STORED_PROFILE);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        userId: "u1",
        source: "profile",
        sourceRef: "fact-1",
        content: "алергія на горіхи",
        // Відбиток тексту факту — без нього jobId BullMQ не розрізняв би
        // ЗМІСТ, і повторний інжест того самого id після видалення був би
        // тихо проковтнутий дедупом на добу.
        dedupeSalt: expect.any(String),
      }),
    );
  });
});

describe("PUT /api/me/profile — ПАСТКА 4: шлях дзеркалення падає, PUT все одно 200", () => {
  it("enqueueMemoryIngest кидає → профіль усе одно збережено і 200", async () => {
    enqueueMock.mockRejectedValueOnce(new Error("redis unavailable"));
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(STORED_PROFILE);
  });
});

describe("PUT /api/me/profile — консент не ламає збереження профілю", () => {
  it("енкʼю проходить успішно → профіль збережено; консент перевіряється вже у воркері", async () => {
    // Роут НЕ вирішує питання консенту — він лише кладе роботу в чергу.
    // `isConsentEnabled(userId)` перевіряє `service.remember()`, який
    // виконується у воркері (або у `runDirectDispatch` без Redis), уже
    // після того, як цей PUT відповів. Отже гарантія тут одна: профіль
    // зберігається незалежно від того, чим скінчиться дзеркалення.
    enqueueMock.mockImplementationOnce(async () => {});
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(STORED_PROFILE);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/me/profile — auth guard", () => {
  it("→ 401 без сесії, mirror не викликається", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

/**
 * `DELETE /api/me` — єдиний живий шлях видалення акаунта з 2026-09-21.
 *
 * До 30-денного вікна (спека `docs/work/specs/user-deletion-grace-window.md`)
 * видаляв Better Auth через `POST /api/auth/delete-user`, і саме той
 * ендпоінт тримав перевірку пароля. Зараз він вимкнений
 * (`user.deleteUser.enabled: false`, пін у `auth.test.ts`), а планку
 * перебрав на себе цей роут: `requireFreshSession()` + звірка пароля.
 *
 * Без цих тестів планку не пінував НІХТО: `dataRights.test.ts` перевіряє
 * `requestAccountDeletion` на рівні функції, вже ПІСЛЯ гвардів, а
 * route-рівня для видалення в репо не було. Тобто зникнення звірки пароля
 * опускало вимогу з «знає пароль» до «має живу сесію» — і вкрадена сесія
 * могла б запустити незворотний відлік — жодного червоного тесту при цьому.
 */
describe("DELETE /api/me — гварди живого шляху видалення", () => {
  it("невірний пароль → 400 INVALID_PASSWORD і відлік НЕ стартує", async () => {
    verifyPasswordMock.mockResolvedValueOnce({ ok: false });
    const app = createApp();

    const res = await request(app)
      .delete("/api/me")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ password: "wrong" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PASSWORD");
    // Головне тут — саме це: мітка не поставлена.
    expect(requestDeletionMock).not.toHaveBeenCalled();
  });

  it("вірний пароль → 200 з датами вікна і мітка поставлена один раз", async () => {
    const app = createApp();

    const res = await request(app)
      .delete("/api/me")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ password: "correct-horse" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      deletedAt: "2026-09-23T10:00:00.000Z",
      scheduledPurgeAt: "2026-10-23T10:00:00.000Z",
    });
    expect(verifyPasswordMock).toHaveBeenCalledWith("u1", "correct-horse");
    expect(requestDeletionMock).toHaveBeenCalledTimes(1);
  });

  it("без сесії → 401, без звірки пароля й без мітки", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const app = createApp();

    const res = await request(app)
      .delete("/api/me")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ password: "correct-horse" });

    expect(res.status).toBe(401);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(requestDeletionMock).not.toHaveBeenCalled();
  });
});
