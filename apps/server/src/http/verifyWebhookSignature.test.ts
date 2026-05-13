import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";

import {
  signWebhookRequest,
  verifyWebhookRequest,
  verifyWebhookSignature,
} from "./verifyWebhookSignature.js";

/**
 * Контракт `verifyWebhookSignature`:
 *
 *   1. Pure verifier (`verifyWebhookRequest`) — header parsing + replay
 *      window + HMAC compare без env / Express залежностей.
 *   2. Middleware (`verifyWebhookSignature`) — двофаза rollout:
 *        - WEBHOOK_HMAC_SECRET="" → no-op (бо feature disabled).
 *        - WEBHOOK_HMAC_REQUIRED=false → warn-only (passthrough на mismatch).
 *        - WEBHOOK_HMAC_REQUIRED=true  → 401 на mismatch.
 *   3. `signWebhookRequest` — стабільний формат для n8n / ops tooling.
 *
 * Replay-window — UNIX seconds, симетрично навколо `now` (5min default).
 */

const SECRET = "test-hmac-secret-32bytes-min-len";

function makeApp(opts: {
  secret?: string;
  required?: boolean;
  toleranceSec?: number;
}) {
  // The middleware reads its config via the injected getter, so unit tests
  // pin a static config instead of dancing around module-load order.
  const cfg = {
    secret: opts.secret ?? "",
    required: opts.required ?? false,
    toleranceSec: opts.toleranceSec ?? 300,
  };
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(verifyWebhookSignature(() => cfg));
  app.post("/echo", (req, res) => {
    res.status(200).json({ received: req.body });
  });
  return app;
}

describe("verifyWebhookRequest (pure)", () => {
  it("повертає ok=true коли secret порожній (feature disabled)", () => {
    const out = verifyWebhookRequest(
      { headers: {} } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      { secret: "", required: false, toleranceSec: 300 },
    );
    expect(out.ok).toBe(true);
  });

  it("повертає missing_signature коли header відсутній", () => {
    const out = verifyWebhookRequest(
      { headers: {}, rawBody: Buffer.from("{}") } as unknown as Parameters<
        typeof verifyWebhookRequest
      >[0],
      { secret: SECRET, required: true, toleranceSec: 300 },
    );
    expect(out).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("повертає missing_timestamp коли header відсутній", () => {
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": "deadbeef" },
        rawBody: Buffer.from("{}"),
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      { secret: SECRET, required: true, toleranceSec: 300 },
    );
    expect(out).toEqual({ ok: false, reason: "missing_timestamp" });
  });

  it("повертає malformed_timestamp на нечислове значення", () => {
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": "deadbeef", "x-timestamp": "yesterday" },
        rawBody: Buffer.from("{}"),
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      { secret: SECRET, required: true, toleranceSec: 300 },
    );
    expect(out).toEqual({ ok: false, reason: "malformed_timestamp" });
  });

  it("rejects timestamp поза tolerance window (старіше)", () => {
    const ts = 1_700_000_000;
    const body = Buffer.from('{"x":1}');
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: body,
    });
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": sig, "x-timestamp": String(ts) },
        rawBody: body,
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      {
        secret: SECRET,
        required: true,
        toleranceSec: 300,
        // `now` 10 хв пізніше — поза 5-хвилинним вікном
        now: () => (ts + 600) * 1000,
      },
    );
    expect(out).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("rejects timestamp поза tolerance window (з майбутнього)", () => {
    const ts = 1_700_000_000;
    const body = Buffer.from('{"x":1}');
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: body,
    });
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": sig, "x-timestamp": String(ts) },
        rawBody: body,
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      {
        secret: SECRET,
        required: true,
        toleranceSec: 300,
        now: () => (ts - 600) * 1000,
      },
    );
    expect(out).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("ok=true для коректного підпису у середині вікна", () => {
    const ts = 1_700_000_000;
    const body = Buffer.from('{"alertId":"wf-15:42","summary":"x"}');
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: body,
    });
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": sig, "x-timestamp": String(ts) },
        rawBody: body,
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      {
        secret: SECRET,
        required: true,
        toleranceSec: 300,
        now: () => (ts + 30) * 1000,
      },
    );
    expect(out.ok).toBe(true);
  });

  it("signature_mismatch коли тіло модифіковано", () => {
    const ts = 1_700_000_000;
    const original = Buffer.from('{"x":1}');
    const tampered = Buffer.from('{"x":2}');
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: original,
    });
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": sig, "x-timestamp": String(ts) },
        rawBody: tampered,
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      {
        secret: SECRET,
        required: true,
        toleranceSec: 300,
        now: () => ts * 1000,
      },
    );
    expect(out).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("raw_body_unavailable коли middleware не захопила rawBody", () => {
    const ts = 1_700_000_000;
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": "deadbeef", "x-timestamp": String(ts) },
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      {
        secret: SECRET,
        required: true,
        toleranceSec: 300,
        now: () => ts * 1000,
      },
    );
    expect(out).toEqual({ ok: false, reason: "raw_body_unavailable" });
  });

  it("tolerance=0 приймає рівно current second", () => {
    const ts = 1_700_000_000;
    const body = Buffer.from("{}");
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: body,
    });
    const out = verifyWebhookRequest(
      {
        headers: { "x-signature": sig, "x-timestamp": String(ts) },
        rawBody: body,
      } as unknown as Parameters<typeof verifyWebhookRequest>[0],
      {
        secret: SECRET,
        required: true,
        toleranceSec: 0,
        now: () => ts * 1000,
      },
    );
    expect(out.ok).toBe(true);
  });
});

describe("signWebhookRequest (helper)", () => {
  it("повертає hex-encoded HMAC-SHA256 з timestamp+rawBody префіксом", () => {
    const ts = 1_700_000_000;
    const body = Buffer.from("hello");
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: body,
    });
    const manual = crypto
      .createHmac("sha256", SECRET)
      .update(`${ts}.`)
      .update(body)
      .digest("hex");
    expect(sig).toBe(manual);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("приймає рядок як rawBody", () => {
    const ts = 1_700_000_000;
    const a = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: "{}",
    });
    const b = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: Buffer.from("{}"),
    });
    expect(a).toBe(b);
  });
});

describe("verifyWebhookSignature (Express middleware)", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...origEnv };
  });

  it("WEBHOOK_HMAC_SECRET='' — middleware no-op (request пропускається)", async () => {
    const app = makeApp({ secret: "", required: false });
    const res = await request(app).post("/echo").send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
  });

  it("grace mode: mismatch passes through but emits warn (200)", async () => {
    const app = makeApp({ secret: SECRET, required: false });
    const res = await request(app)
      .post("/echo")
      .set("X-Signature", "deadbeef")
      .set("X-Timestamp", String(Math.floor(Date.now() / 1000)))
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
  });

  it("required mode: missing signature → 401", async () => {
    const app = makeApp({ secret: SECRET, required: true });
    const res = await request(app).post("/echo").send({ alertId: "wf-15:42" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("WEBHOOK_HMAC_INVALID");
    expect(res.body.reason).toBe("missing_signature");
  });

  it("required mode: коректний підпис → 200", async () => {
    const ts = 1_700_000_000;
    vi.setSystemTime(new Date(ts * 1000));
    const app = makeApp({ secret: SECRET, required: true });
    const payload = { alertId: "wf-15:42", summary: "ok" };
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody,
    });
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .set("X-Signature", sig)
      .set("X-Timestamp", String(ts))
      .send(rawBody.toString("utf8"));
    expect(res.status).toBe(200);
    expect(res.body.received).toEqual(payload);
  });

  it("required mode: tampered body → 401 (mismatch)", async () => {
    const ts = 1_700_000_000;
    vi.setSystemTime(new Date(ts * 1000));
    const app = makeApp({ secret: SECRET, required: true });
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody: '{"x":1}',
    });
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .set("X-Signature", sig)
      .set("X-Timestamp", String(ts))
      .send('{"x":2}');
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("signature_mismatch");
  });

  it("required mode: replay поза 5min вікном → 401", async () => {
    const ts = 1_700_000_000;
    vi.setSystemTime(new Date((ts + 600) * 1000));
    const app = makeApp({
      secret: SECRET,
      required: true,
      toleranceSec: 300,
    });
    const rawBody = Buffer.from('{"x":1}', "utf8");
    const sig = signWebhookRequest({
      secret: SECRET,
      timestampSec: ts,
      rawBody,
    });
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .set("X-Signature", sig)
      .set("X-Timestamp", String(ts))
      .send(rawBody.toString("utf8"));
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("timestamp_out_of_window");
  });
});
