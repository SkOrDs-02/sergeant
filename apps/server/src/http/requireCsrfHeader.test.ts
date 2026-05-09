import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

import { requireCsrfHeader } from "./requireCsrfHeader.js";

/**
 * Покриваємо контракт `requireCsrfHeader()`:
 *
 *   1. State-changing methods без `X-Requested-With: XMLHttpRequest` →
 *      403 з `code: "CSRF_HEADER_REQUIRED"`.
 *   2. State-changing methods з правильним header-ом → next(), handler
 *      повертає 200.
 *   3. Safe methods (GET/HEAD/OPTIONS) пропускаються БЕЗ header-а.
 *   4. Allowlist шляхи (`/api/auth/*`, `/api/mono/webhook`,
 *      `/api/csp-report`, `/api/metrics/web-vitals`, `/api/internal/*`)
 *      пропускаються незалежно від методу і без header-а.
 *   5. Запити з `X-Api-Secret` header-ом пропускаються (S2S cron) —
 *      але CSRF-bypass НЕ означає auth-bypass: `requireApiSecret`
 *      далі в ланцюжку звалить запит, якщо секрет невалідний.
 *   6. `onReject(...)` callback викликається з method+path при відмові.
 *
 * Тести вживають supertest проти legitimate Express app з трьома
 * handler-ами (state-changing на `/api/foo`, GET на `/api/foo`, та
 * декілька exempt-paths-ів) — це найближче до реального wiring у
 * `app.ts` і ловить регресії на `req.path` vs `req.originalUrl`.
 */

function makeApp(handler: express.RequestHandler) {
  const app = express();
  app.use(handler);
  app.all("/api/foo", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/auth/sign-in/email", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/mono/webhook", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/mono/webhook/legacy", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/csp-report", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/metrics/web-vitals", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/v1/metrics/web-vitals", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/internal/billing/charge", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.all("/api/push/send", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe("requireCsrfHeader — state-changing requests без header-а", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s /api/foo без X-Requested-With → 403 + CSRF_HEADER_REQUIRED",
    async (method) => {
      const app = makeApp(requireCsrfHeader());
      const res =
        await request(app)[
          method.toLowerCase() as "post" | "put" | "patch" | "delete"
        ]("/api/foo");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("CSRF_HEADER_REQUIRED");
    },
  );

  it("викликає onReject callback з method+path при відмові", async () => {
    const onReject = vi.fn();
    const app = makeApp(requireCsrfHeader({ onReject }));
    await request(app).post("/api/foo");
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/foo",
    });
  });

  it("POST з неправильним XRW value (`fetch` замість `XMLHttpRequest`) теж 403", async () => {
    // Свідомо вимагаємо саме canonical `XMLHttpRequest`, а не довільний
    // truthy value — щоб опечатки нового SDK ловились локально.
    const app = makeApp(requireCsrfHeader());
    const res = await request(app)
      .post("/api/foo")
      .set("X-Requested-With", "fetch");
    expect(res.status).toBe(403);
  });
});

describe("requireCsrfHeader — допустимі запити", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s /api/foo з X-Requested-With: XMLHttpRequest → 200",
    async (method) => {
      const app = makeApp(requireCsrfHeader());
      const res = await request(app)
        [
          method.toLowerCase() as "post" | "put" | "patch" | "delete"
        ]("/api/foo")
        .set("X-Requested-With", "XMLHttpRequest");
      expect(res.status).toBe(200);
    },
  );

  it.each(["GET", "HEAD", "OPTIONS"])(
    "%s /api/foo пропускається БЕЗ XRW (safe-метод)",
    async (method) => {
      const app = makeApp(requireCsrfHeader());
      const res =
        await request(app)[method.toLowerCase() as "get" | "head" | "options"](
          "/api/foo",
        );
      expect(res.status).toBe(200);
    },
  );
});

describe("requireCsrfHeader — exempt paths", () => {
  it.each([
    "/api/auth/sign-in/email",
    "/api/mono/webhook",
    "/api/mono/webhook/legacy",
    "/api/csp-report",
    "/api/metrics/web-vitals",
    "/api/v1/metrics/web-vitals",
    "/api/internal/billing/charge",
  ])("POST %s БЕЗ XRW → пропускається (200)", async (path) => {
    const app = makeApp(requireCsrfHeader());
    const res = await request(app).post(path);
    expect(res.status).toBe(200);
  });
});

describe('requireCsrfHeader — exempt paths під `app.use("/api", …)` mount', () => {
  function makeMountedApp() {
    const app = express();
    app.use("/api", requireCsrfHeader());
    app.all("/api/auth/sign-up/email", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/auth/sign-in/email", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/mono/webhook", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/billing/stripe-webhook", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/csp-report", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/metrics/web-vitals", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/internal/billing/charge", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.all("/api/foo", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it.each([
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/mono/webhook",
    "/api/billing/stripe-webhook",
    "/api/csp-report",
    "/api/metrics/web-vitals",
    "/api/internal/billing/charge",
  ])("POST %s БЕЗ XRW під `/api` mount → пропускається (200)", async (path) => {
    const app = makeMountedApp();
    const res = await request(app).post(path);
    expect(res.status).toBe(200);
  });

  it("POST /api/foo під `/api` mount БЕЗ XRW → 403 (regression guard)", async () => {
    const app = makeMountedApp();
    const res = await request(app).post("/api/foo");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_HEADER_REQUIRED");
  });

  it("POST /api/foo під `/api` mount з XRW → 200", async () => {
    const app = makeMountedApp();
    const res = await request(app)
      .post("/api/foo")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
  });
});

describe("requireCsrfHeader — X-Api-Secret bypass для S2S викликів", () => {
  it("POST /api/push/send з X-Api-Secret → пропускається без XRW", async () => {
    // Defensive: CSRF-вектор покладається на cookie-сесію, що приклеїться
    // браузером. Server-to-server виклики (cron, n8n worker) шлють
    // `X-Api-Secret` і взагалі без cookie → CSRF тут нерелевантний.
    // Валідність самого секрета перевіряє `requireApiSecret` далі в
    // ланцюжку, не цей middleware.
    const app = makeApp(requireCsrfHeader());
    const res = await request(app)
      .post("/api/push/send")
      .set("X-Api-Secret", "dummy-value-validated-elsewhere");
    expect(res.status).toBe(200);
  });

  it("без X-Api-Secret і без XRW → 403", async () => {
    const app = makeApp(requireCsrfHeader());
    const res = await request(app).post("/api/push/send");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_HEADER_REQUIRED");
  });
});
