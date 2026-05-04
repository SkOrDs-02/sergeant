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

import {
  requireSession,
  requireSessionSoft,
  __testingResetSoftFailureCounter,
} from "./requireSession.js";

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
  __testingResetSoftFailureCounter();
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

    // Soft-варіант мапить транзиентну throw у 401, не у 500 (push-сценарій),
    // допоки circuit-breaker не спрацював (див. M13-блок нижче).
    expect(res.status).toBe(401);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});

// M13 — circuit-breaker для persistent session-lookup failures.
// Див. docs/security/hardening/M13-require-session-soft-loud-fail.md.
describe("M13: requireSessionSoft() ескалюється з 401 у 503 на persistent fail", () => {
  it("під threshold (4 fail-и поспіль) лишається 401 з UNAUTHORIZED", async () => {
    const app = makeApp(requireSessionSoft());

    for (let i = 0; i < 4; i++) {
      getSessionUserMock.mockRejectedValueOnce(new Error("transient db"));
      const res = await request(app).get("/protected");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
      expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    }
  });

  it("на 5-му fail-і поспіль ескалюється у 503 SESSION_LOOKUP_UNAVAILABLE", async () => {
    const app = makeApp(requireSessionSoft());

    for (let i = 0; i < 4; i++) {
      getSessionUserMock.mockRejectedValueOnce(new Error("db down"));
      await request(app).get("/protected");
    }
    getSessionUserMock.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/protected");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SESSION_LOOKUP_UNAVAILABLE");
    // CORP лишається same-origin навіть на 503 (не послаблюємо H8 при outage).
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("успішний lookup ресетить лічильник: після 4 fail + 1 success, наступний throw → 401", async () => {
    const app = makeApp(requireSessionSoft());

    for (let i = 0; i < 4; i++) {
      getSessionUserMock.mockRejectedValueOnce(new Error("db blip"));
      await request(app).get("/protected");
    }
    // Successful lookup посередині скидає лічильник.
    getSessionUserMock.mockResolvedValueOnce({ id: "u-1", email: "x@y.z" });
    const ok = await request(app).get("/protected");
    expect(ok.status).toBe(200);

    // Тепер новий throw — це 1-й, не 5-й, тож 401, не 503.
    getSessionUserMock.mockRejectedValueOnce(new Error("db blip"));
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it('"немає сесії" (user=null) НЕ інкрементує failure counter', async () => {
    const app = makeApp(requireSessionSoft());

    // 10 раз поспіль "немає сесії" — все одно 401 і ніколи не 503.
    for (let i = 0; i < 10; i++) {
      getSessionUserMock.mockResolvedValueOnce(null);
      const res = await request(app).get("/protected");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    }
  });
});
