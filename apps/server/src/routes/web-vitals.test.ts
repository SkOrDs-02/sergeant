import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";

import { createWebVitalsRouter } from "./web-vitals.js";
import { errorHandler } from "../http/errorHandler.js";

/**
 * Route-level repro для находки schemathesis: сирий NUL-байт (0x00) у JSON
 * body валить `express.json()` body-parser (http-errors SyntaxError, status=400,
 * expose=true) ще до `webVitalsHandler`. Раніше errorHandler класифікував це
 * як programmer-bug → `400 { code: "INTERNAL", message: "Server error" }`.
 * Тепер non-operational 4xx серіалізується як чистий VALIDATION.
 */

function makeApp() {
  const app = express();
  app.use("/api/metrics/web-vitals", express.json());
  app.use(createWebVitalsRouter());
  app.use(errorHandler);
  return app;
}

describe("POST /api/metrics/web-vitals (body-parser hardening)", () => {
  it("NUL-байт у JSON body → 400 VALIDATION, не INTERNAL", async () => {
    const res = await request(makeApp())
      .post("/api/metrics/web-vitals")
      .set("Content-Type", "application/json")
      // Raw 0x00 всередині JSON-рядка — невалідний unescaped control char,
      // JSON.parse у body-parser кидає SyntaxError до нашого handler-а.
      .send(`{"metrics":"${String.fromCharCode(0)}"}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.message).not.toBe("Server error");
  });

  it("валідний payload проходить до handler → 204", async () => {
    const res = await request(makeApp())
      .post("/api/metrics/web-vitals")
      .set("Content-Type", "application/json")
      .send({ metrics: [{ name: "LCP", value: 1200, rating: "good" }] });

    expect(res.status).toBe(204);
  });
});
