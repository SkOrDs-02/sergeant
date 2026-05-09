import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import { apiCorsMiddleware } from "./apiCors.js";

/**
 * `apiCorsMiddleware()` — global CORS for `/api/*`. Це shape перевіряємо тут,
 * щоб preflight для browser-side запитів не мовчки зрізав на missing
 * `Access-Control-Allow-Headers` entries.
 *
 * Особливо критичні headers:
 *   - `X-Requested-With` — обов'язковий для M10 CSRF guard. Browser не дає
 *     cross-origin сторінці виставити XRW без preflight; preflight зупиняється
 *     на CORS allowlist + allow-headers. Якщо XRW відсутній у allow-headers —
 *     preflight валиться, і всі state-changing browser fetch-и до `/api/*`
 *     стають недоступні (включно з Better Auth `/api/auth/sign-up/email`).
 *   - `traceparent`, `tracestate` — W3C Trace Context. Frontend OTel-хук
 *     додає їх до cross-origin fetch; без allow-headers preflight рубає
 *     запити з трейс-хедерами.
 */
describe("apiCorsMiddleware()", () => {
  function makeApp() {
    const app = express();
    app.use("/api", apiCorsMiddleware());
    app.all("/api/auth/sign-up/email", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it("OPTIONS /api/auth/sign-up/email повертає 200 з allow-headers, що містять X-Requested-With", async () => {
    const res = await request(makeApp())
      .options("/api/auth/sign-up/email")
      .set("Origin", "http://127.0.0.1:4173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "x-requested-with, content-type");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-headers"]).toContain(
      "X-Requested-With",
    );
    expect(res.headers["access-control-allow-headers"]).toContain(
      "Content-Type",
    );
  });

  it.each(["traceparent", "tracestate"])(
    "OPTIONS preflight allow-headers містить %s (W3C Trace Context для OTel)",
    async (headerName) => {
      const res = await request(makeApp())
        .options("/api/auth/sign-up/email")
        .set("Origin", "http://127.0.0.1:4173")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", `${headerName}, content-type`);
      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-headers"]).toContain(headerName);
    },
  );

  it("дозволені методи покривають state-changing requests", async () => {
    const res = await request(makeApp())
      .options("/api/auth/sign-up/email")
      .set("Origin", "http://127.0.0.1:4173")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-methods"]).toContain("PUT");
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
  });

  it("ACAO виставляється для allowed origin", async () => {
    const res = await request(makeApp())
      .options("/api/auth/sign-up/email")
      .set("Origin", "http://127.0.0.1:4173")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:4173",
    );
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});
