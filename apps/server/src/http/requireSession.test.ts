import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Покриваємо контракт `requireSession*`:
 *
 * 1. Авторизована відповідь (200) має `Cross-Origin-Resource-Policy:
 *    same-origin` (закриває H8 — login-state oracle).
 * 2. Неавторизована (401) теж має `same-origin` — інакше attacker page
 *    могла б за `onload`/`onerror` `<img src="…/api/me">` визначати, чи
 *    залогінений користувач, незалежно від status.
 * 3. Помилка резолву сесії в `requireSession()` — 500-error через `next(err)`
 *    (НЕ 401), щоб фронт відрізняв "не залогінений" від "у нас все горить";
 *    response теж має `same-origin`, бо ми сетимо хедер до try/catch.
 * 4. `requireSessionSoft()` ковтає exception і повертає 401 — теж із
 *    `same-origin`.
 *
 * Підміняємо тільки `getSessionUser` — Better Auth решта не потрібен,
 * `requireSession*` від нього і залежить.
 */

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("../auth.js", () => ({
  getSessionUser: getSessionUserMock,
}));

import { requireSession, requireSessionSoft } from "./requireSession.js";

function makeApp(handler: express.RequestHandler) {
  const app = express();
  app.get("/protected", handler, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  // Тестуємо саме поведінку middleware — error-handler імітує реальний з
  // `apps/server/src/http/errorHandler.ts`, але нам тут досить мінімального.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({
        error: "Server error",
        message: err instanceof Error ? err.message : String(err),
      });
    },
  );
  return app;
}

beforeEach(() => {
  getSessionUserMock.mockReset();
});

describe("H8: requireSession() сетить Cross-Origin-Resource-Policy: same-origin", () => {
  it("успішна авторизація → 200 і CORP=same-origin", async () => {
    getSessionUserMock.mockResolvedValueOnce({ id: "u-1", email: "x@y.z" });
    const app = makeApp(requireSession());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("без сесії → 401 і CORP=same-origin (закриває login-state oracle)", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);
    const app = makeApp(requireSession());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    // Найкритичніша асерція картки H8: навіть на 401 хедер same-origin,
    // інакше браузер пускає `<img>` cross-origin до тіла-401 → стейт-оракул.
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("getSessionUser кидає → 500 (не 401), і CORP=same-origin", async () => {
    getSessionUserMock.mockRejectedValueOnce(new Error("db unavailable"));
    const app = makeApp(requireSession());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(500);
    // Header сетиться ДО `await getSessionUser` — тому навіть на 500 він є.
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});

describe("H8: requireSessionSoft() теж сетить CORP=same-origin", () => {
  it("успішна авторизація → 200 і CORP=same-origin", async () => {
    getSessionUserMock.mockResolvedValueOnce({ id: "u-1", email: "x@y.z" });
    const app = makeApp(requireSessionSoft());

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("getSessionUser кидає → swallow → 401 і CORP=same-origin", async () => {
    getSessionUserMock.mockRejectedValueOnce(new Error("transient"));
    const app = makeApp(requireSessionSoft());

    const res = await request(app).get("/protected");

    // Soft-варіант мапить throw у 401, не у 500 (push-сценарій).
    expect(res.status).toBe(401);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});
