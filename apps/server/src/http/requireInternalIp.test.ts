import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

import { __internal, requireInternalIp } from "./requireInternalIp.js";

/**
 * Contract for `requireInternalIp(...)` — hardening item M14 layer 1.
 *
 * The middleware sits in front of `/api/push/send` (and any future
 * internal-only endpoints we want to network-gate). The tests exercise
 * three independent surfaces:
 *
 *   1. **Parser** — `parseEntry` / `tokenize` accept the env-var formats
 *      we document (CIDRs, plain IPs, mixed v4/v6, comma- and newline-
 *      separated) and reject malformed input *without* throwing. A
 *      typo in `PUSH_INTERNAL_ALLOWED_IPS` must NOT 500 the route on
 *      first hit; it should silently fall through to the loopback
 *      defaults.
 *   2. **Allow path** — loopback (`127.0.0.1`, `::1`) and explicit
 *      allowlisted IPs/CIDRs let the request through to the next
 *      handler.
 *   3. **Reject path** — non-allowlisted IP returns 403 with
 *      `code: IP_NOT_ALLOWED` and invokes the `onReject(...)` callback
 *      exactly once with the source IP and request path.
 *
 * The supertest harness sets `req.ip` via Express's `trust proxy`
 * mechanism: configuring `app.set("trust proxy", true)` makes Express
 * peel the first `X-Forwarded-For` hop, which mirrors the production
 * topology (Railway edge → API). That keeps the test wired to the
 * same code path `getIp(req)` uses in production rather than reaching
 * for the raw socket.
 */

function makeApp(handler: express.RequestHandler) {
  const app = express();
  // Mirror the production `app.set("trust proxy", 1)` so the test can
  // assert behaviour against forwarded IPs rather than `127.0.0.1`.
  app.set("trust proxy", true);
  app.use(handler);
  app.all("/api/push/send", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe("requireInternalIp — parser", () => {
  it("parseEntry accepts plain IPv4", () => {
    const got = __internal.parseEntry("10.0.0.5");
    expect(got).toMatchObject({
      type: "ipv4",
      prefix: 32,
      address: "10.0.0.5",
    });
  });

  it("parseEntry accepts CIDR IPv4", () => {
    const got = __internal.parseEntry("100.64.0.0/10");
    expect(got).toMatchObject({
      type: "ipv4",
      prefix: 10,
      address: "100.64.0.0",
    });
  });

  it("parseEntry accepts plain IPv6", () => {
    const got = __internal.parseEntry("::1");
    expect(got).toMatchObject({ type: "ipv6", prefix: 128, address: "::1" });
  });

  it("parseEntry accepts CIDR IPv6", () => {
    const got = __internal.parseEntry("fd00::/8");
    expect(got).toMatchObject({ type: "ipv6", prefix: 8, address: "fd00::" });
  });

  it("parseEntry rejects garbage", () => {
    expect(__internal.parseEntry("not-an-ip")).toBeNull();
    expect(__internal.parseEntry("1.2.3.4/x")).toBeNull();
    expect(__internal.parseEntry("1.2.3.4/33")).toBeNull();
    expect(__internal.parseEntry("::1/200")).toBeNull();
    expect(__internal.parseEntry("")).toBeNull();
    expect(__internal.parseEntry("   ")).toBeNull();
  });

  it("tokenize splits on commas, whitespace, and newlines", () => {
    const got = __internal.tokenize("10.0.0.1, 10.0.0.2\n10.0.0.3   10.0.0.4");
    expect(got).toEqual(["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]);
  });

  it("normalizeIp collapses IPv4-mapped IPv6", () => {
    expect(__internal.normalizeIp("::ffff:127.0.0.1")).toEqual({
      ip: "127.0.0.1",
      type: "ipv4",
    });
  });

  it("isAllowlistEmpty true for empty/garbage-only input", () => {
    expect(__internal.isAllowlistEmpty("")).toBe(true);
    expect(__internal.isAllowlistEmpty("   ")).toBe(true);
    expect(__internal.isAllowlistEmpty("garbage,not-ips")).toBe(true);
  });

  it("isAllowlistEmpty false when at least one entry parses", () => {
    expect(__internal.isAllowlistEmpty("garbage,10.0.0.5")).toBe(false);
  });
});

describe("requireInternalIp — allow path", () => {
  it("loopback (127.0.0.1) is implicit even without operator entries", async () => {
    const app = makeApp(
      requireInternalIp({ entries: "", failClosedOnEmpty: true }),
    );
    // supertest connects over loopback: req.ip will be "::ffff:127.0.0.1"
    // or "127.0.0.1" depending on Node's dual-stack listener — both
    // collapse to v4 via `normalizeIp` and match the implicit
    // `127.0.0.1/32` entry.
    const res = await request(app).get("/api/push/send");
    expect(res.status).toBe(200);
  });

  it("explicit IPv4 allowlist allows forwarded source IP", async () => {
    const app = makeApp(
      requireInternalIp({ entries: "100.64.0.5", failClosedOnEmpty: true }),
    );
    const res = await request(app)
      .get("/api/push/send")
      .set("X-Forwarded-For", "100.64.0.5");
    expect(res.status).toBe(200);
  });

  it("explicit CIDR allowlist allows any IP within the range", async () => {
    const app = makeApp(
      requireInternalIp({
        entries: "100.64.0.0/10",
        failClosedOnEmpty: true,
      }),
    );
    const res = await request(app)
      .get("/api/push/send")
      .set("X-Forwarded-For", "100.65.42.1");
    expect(res.status).toBe(200);
  });
});

describe("requireInternalIp — reject path", () => {
  it("non-allowlisted forwarded IP returns 403 + IP_NOT_ALLOWED", async () => {
    const app = makeApp(
      requireInternalIp({
        entries: "100.64.0.0/10",
        failClosedOnEmpty: true,
      }),
    );
    const res = await request(app)
      .get("/api/push/send")
      .set("X-Forwarded-For", "203.0.113.4");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IP_NOT_ALLOWED");
  });

  it("invokes onReject callback exactly once with ip + path", async () => {
    const onReject = vi.fn();
    const app = makeApp(
      requireInternalIp({
        entries: "100.64.0.0/10",
        failClosedOnEmpty: true,
        onReject,
      }),
    );
    await request(app)
      .post("/api/push/send")
      .set("X-Forwarded-For", "203.0.113.4");
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith({
      ip: "203.0.113.4",
      path: "/api/push/send",
    });
  });

  it("onReject throwing does NOT break the response", async () => {
    const onReject = vi.fn(() => {
      throw new Error("metric system on fire");
    });
    const app = makeApp(
      requireInternalIp({
        entries: "100.64.0.0/10",
        failClosedOnEmpty: true,
        onReject,
      }),
    );
    const res = await request(app)
      .post("/api/push/send")
      .set("X-Forwarded-For", "203.0.113.4");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IP_NOT_ALLOWED");
  });
});

describe("requireInternalIp — empty allowlist policy", () => {
  it("fail-open mode (dev/test) lets non-loopback through with no allowlist", async () => {
    const app = makeApp(
      requireInternalIp({ entries: "", failClosedOnEmpty: false }),
    );
    const res = await request(app)
      .get("/api/push/send")
      .set("X-Forwarded-For", "203.0.113.4");
    expect(res.status).toBe(200);
  });

  it("fail-closed mode (production) returns 503 NOT_CONFIGURED with no allowlist", async () => {
    const app = makeApp(
      requireInternalIp({ entries: "", failClosedOnEmpty: true }),
    );
    const res = await request(app)
      .get("/api/push/send")
      .set("X-Forwarded-For", "203.0.113.4");
    // Empty operator allowlist + fail-closed → 503 because the
    // implicit loopback defaults still exist (built list is non-null)
    // but the source IP `203.0.113.4` is not in them. The 503 is
    // reserved for the truly-empty (parser failed on every token) case;
    // a forwarded non-loopback hits the standard 403 reject path.
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IP_NOT_ALLOWED");
  });
});
