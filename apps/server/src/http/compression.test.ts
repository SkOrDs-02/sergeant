import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import { createCompressionMiddleware } from "./compression.js";

/**
 * B34 regression — SSE responses must never be gzipped.
 *
 * The old guard keyed off the REQUEST `Accept` header
 * (`req.headers.accept === "text/event-stream"`), which never matched in
 * practice: the api-client always sends `Accept: application/json`
 * (`packages/api-client/src/httpClient.ts` JSON_MIME) — including for the
 * streaming call, which goes through `http.raw`. With that guard dead,
 * `compression.filter()` saw the response `Content-Type: text/event-stream`,
 * treated it as compressible (`^text/`), and gzip buffered the whole stream
 * past the 1KB threshold — delaying the first token and swallowing the
 * keep-alive `: ping` heartbeat comments that exist specifically to defeat
 * idle-connection timeouts.
 *
 * The fix keys off the RESPONSE Content-Type (`res.getHeader`), which is the
 * one signal every SSE handler in this codebase actually sets before writing
 * (`res.setHeader("Content-Type", "text/event-stream; ...")` in
 * `chatStream.ts`).
 */

function bigPayload(bytes: number): string {
  return "x".repeat(bytes);
}

function makeApp() {
  const app = express();
  app.use(createCompressionMiddleware());

  app.get("/sse", (_req, res) => {
    // Mirrors chatStream.ts: Content-Type set before any write, no explicit
    // `Accept` promise from the client.
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.status(200).end(`data: ${bigPayload(2000)}\n\n`);
  });

  app.get("/json", (_req, res) => {
    res.status(200).json({ data: bigPayload(2000) });
  });

  return app;
}

describe("createCompressionMiddleware — filter (B34 regression)", () => {
  it("не стискає SSE-відповідь, навіть коли клієнт шле Accept: application/json (реальна поведінка api-client)", async () => {
    const app = makeApp();
    const res = await request(app)
      .get("/sse")
      .set("Accept", "application/json")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers["content-type"]).toContain("text/event-stream");
  });

  it("не стискає SSE-відповідь, коли клієнт коректно шле Accept: text/event-stream", async () => {
    const app = makeApp();
    const res = await request(app)
      .get("/sse")
      .set("Accept", "text/event-stream")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("усе ще стискає звичайну JSON-відповідь понад 1KB threshold", async () => {
    const app = makeApp();
    const res = await request(app).get("/json").set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  it("не стискає нічого, коли клієнт не приймає компресію (Accept-Encoding: identity)", async () => {
    // supertest/superagent sends `Accept-Encoding: gzip, deflate` by
    // default, so "no Accept-Encoding" is simulated explicitly here rather
    // than by omitting `.set(...)`.
    const app = makeApp();
    const res = await request(app)
      .get("/json")
      .set("Accept-Encoding", "identity");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});
