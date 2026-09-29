import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

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
 *
 * `PUT /api/me/profile` живе окремо в `me.profile.route.test.ts` (там і
 * причина поділу): DELETE-шлях не чіпає ai-memory ingest, тож
 * `ingestQueue.js`/`bootstrap.js` тут не мокаємо — обидва модулі лишаються
 * реальними, але лишаються неторкнутими (`getAiMemory()` лениться,
 * BullMQ-`Queue`/`Worker` створюються лише всередині функцій), бо
 * `mirrorProfileMemoryEntries` у DELETE-хендлері не викликається.
 */

const {
  mockPool,
  queryMock,
  getSessionUserMock,
  verifyPasswordMock,
  requestDeletionMock,
} = vi.hoisted(() => {
  process.env["AI_MEMORY_ENABLED"] = "true";
  const queryMock = vi.fn();
  const mockClient = { query: queryMock, release: vi.fn() };
  const mockPool = {
    query: queryMock,
    connect: vi.fn().mockResolvedValue(mockClient),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  const verifyPasswordMock = vi.fn();
  const requestDeletionMock = vi.fn();
  return {
    mockPool,
    queryMock,
    getSessionUserMock,
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

import { createApp } from "./../app.js";

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: "u1" });
  verifyPasswordMock.mockReset();
  verifyPasswordMock.mockResolvedValue({ ok: true });
  requestDeletionMock.mockReset();
  requestDeletionMock.mockResolvedValue({
    ok: true,
    deletedAt: "2026-09-23T10:00:00.000Z",
    scheduledPurgeAt: "2026-10-23T10:00:00.000Z",
  });
});

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
