import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import {
  BODY_SIZE_POLICY,
  applyBodySizePolicy,
  type BodySizeRule,
} from "./bodySizePolicy.js";

/**
 * Контракт `bodySizePolicy.ts` — єдине джерело правди для per-route
 * `express.json/raw({ limit })` mount-ів.
 *
 *   1. Policy-таблиця має валідні rule-и (всі ключі заповнені, kind
 *      коректний, raw-rule має `type`).
 *   2. У таблиці є явний default-rule (prefix "/") — без нього будь-який
 *      незарестрований route ходив би БЕЗ json-парсера.
 *   3. `applyBodySizePolicy()` дотримує contract:
 *      - Великі payload-и на route з підвищеним лімітом — приймає (200).
 *      - Перевищення route-ліміту — 413 PayloadTooLargeError.
 *      - Перевищення global default (128KB) — 413.
 *      - Дефолтний "малий" payload (≤128KB) — 200 на будь-якому route.
 *      - Type-aware mount-и `/api/csp-report` спрацьовують для кастомних
 *        content-type-ів.
 */

function makeApp() {
  const app = express();
  applyBodySizePolicy(app);
  app.all("*", (req, res) => {
    res.status(200).json({
      receivedKeys: Object.keys((req.body as Record<string, unknown>) ?? {})
        .length,
      bodyType: typeof req.body,
    });
  });
  return app;
}

function buildJsonPayload(approxBytes: number): Record<string, string> {
  // Pad with a single string field so the payload size is predictable; JSON
  // overhead (`{"data":"..."}`) is ~12B, accounted for in the caller.
  return { data: "x".repeat(Math.max(0, approxBytes - 12)) };
}

describe("BODY_SIZE_POLICY (declarative table)", () => {
  it("кожен rule заповнений: pathPrefix, kind, limit, reason", () => {
    for (const rule of BODY_SIZE_POLICY) {
      expect(rule.pathPrefix).toMatch(/^\//);
      expect(rule.limit).toMatch(/^\d+(?:b|kb|mb|gb)$/i);
      expect(rule.reason.length).toBeGreaterThan(8);
      expect(["json", "raw"]).toContain(rule.kind);
      if (rule.kind === "raw") {
        expect(rule.type).toBeTruthy();
      }
    }
  });

  it("має explicit default-rule (prefix `/`) — інакше будь-який route без явної policy лишається без json-парсера", () => {
    const defaults = BODY_SIZE_POLICY.filter(
      (r: BodySizeRule) => r.pathPrefix === "/",
    );
    expect(defaults.length).toBe(1);
    expect(defaults[0]!.kind).toBe("json");
    expect(defaults[0]!.limit).toBe("128kb");
  });

  it("specific-route правила НЕ повторюються випадково (крім multi-content-type на /api/csp-report)", () => {
    const seen = new Map<string, BodySizeRule[]>();
    for (const rule of BODY_SIZE_POLICY) {
      const list = seen.get(rule.pathPrefix) ?? [];
      list.push(rule);
      seen.set(rule.pathPrefix, list);
    }
    for (const [prefix, list] of seen) {
      if (list.length > 1) {
        // Дублі дозволені тільки коли кожен rule має унікальний `type`-matcher.
        const types = new Set(list.map((r: BodySizeRule) => r.type ?? "*"));
        expect(
          types.size,
          `prefix ${prefix} має дублі без унікального type`,
        ).toBe(list.length);
      }
    }
  });
});

describe("applyBodySizePolicy — payload acceptance", () => {
  it("default route приймає малий JSON ≤128KB", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/something-default")
      .set("Content-Type", "application/json")
      .send({ hello: "world" });
    expect(res.status).toBe(200);
    expect(res.body.receivedKeys).toBe(1);
  });

  it("default route 413 при перевищенні 128KB", async () => {
    const app = makeApp();
    const big = buildJsonPayload(200 * 1024); // 200KB
    const res = await request(app)
      .post("/api/something-default")
      .set("Content-Type", "application/json")
      .send(big);
    expect(res.status).toBe(413);
  });

  it("/api/sync приймає 5.5MB (під лімітом 6MB)", async () => {
    const app = makeApp();
    const big = buildJsonPayload(5.5 * 1024 * 1024);
    const res = await request(app)
      .post("/api/sync/push")
      .set("Content-Type", "application/json")
      .send(big);
    expect(res.status).toBe(200);
  });

  it("/api/sync 413 при перевищенні 6MB", async () => {
    const app = makeApp();
    const tooBig = buildJsonPayload(7 * 1024 * 1024);
    const res = await request(app)
      .post("/api/sync/push")
      .set("Content-Type", "application/json")
      .send(tooBig);
    expect(res.status).toBe(413);
  });

  it("/api/chat приймає до ~900KB (під лімітом 1MB)", async () => {
    const app = makeApp();
    const big = buildJsonPayload(900 * 1024);
    const res = await request(app)
      .post("/api/chat")
      .set("Content-Type", "application/json")
      .send(big);
    expect(res.status).toBe(200);
  });

  it("/api/chat 413 при перевищенні 1MB", async () => {
    const app = makeApp();
    const tooBig = buildJsonPayload(1.5 * 1024 * 1024);
    const res = await request(app)
      .post("/api/chat")
      .set("Content-Type", "application/json")
      .send(tooBig);
    expect(res.status).toBe(413);
  });

  it("/api/metrics/web-vitals — жорсткий 10KB cap", async () => {
    const app = makeApp();
    const tooBig = buildJsonPayload(20 * 1024);
    const res = await request(app)
      .post("/api/metrics/web-vitals")
      .set("Content-Type", "application/json")
      .send(tooBig);
    expect(res.status).toBe(413);
  });

  it("/api/csp-report приймає браузерні `application/csp-report` payload-и", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify({ "csp-report": { violatedDirective: "img-src" } }));
    expect(res.status).toBe(200);
    expect(res.body.bodyType).toBe("object");
  });

  it("/api/csp-report приймає Reporting-API `application/reports+json`", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/reports+json")
      .send(JSON.stringify([{ type: "csp-violation", body: {} }]));
    expect(res.status).toBe(200);
  });

  it("/api/billing/stripe-webhook — raw-парсер, body Buffer-ом доходить до handler", async () => {
    // Окремо інстансимо app, щоб додати handler, який перевіряє type body-а.
    const app = express();
    applyBodySizePolicy(app);
    app.post("/api/billing/stripe-webhook", (req, res) => {
      // express.raw → req.body це Buffer (а не object).
      res.status(200).json({ isBuffer: Buffer.isBuffer(req.body) });
    });
    const res = await request(app)
      .post("/api/billing/stripe-webhook")
      .set("Content-Type", "application/json")
      .send('{"type":"checkout.session.completed"}');
    expect(res.status).toBe(200);
    expect(res.body.isBuffer).toBe(true);
  });
});
