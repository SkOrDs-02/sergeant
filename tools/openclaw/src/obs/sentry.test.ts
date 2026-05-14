import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/node";

import {
  OPENCLAW_SENTRY_DENY_URLS,
  applyOpenclawBeforeSend,
} from "./sentry.js";

/**
 * PII roast 2026-05-13 §P0-S2/S3/S5: OpenClaw was the largest pre-audit
 * gap — `Sentry.init({ dsn, tracesSampleRate: 0.1 })` shipped events
 * with default `sendDefaultPii: true` and no scrubber. Bot tokens leaked
 * through `console.error("send failed", JSON.stringify(resp))` style
 * traces, and request bodies / headers went straight to ingest.
 *
 * These tests pin the parity contract with the server SDK
 * (`apps/server/src/sentry.ts`) — every gate that closes a leak path
 * server-side must also close it for OpenClaw.
 */
function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides } as ErrorEvent;
}

describe("applyOpenclawBeforeSend", () => {
  it("drops event.request.data and request.cookies wholesale", () => {
    const ev = makeEvent({
      request: {
        data: { secret: "p1", note: "leak" },
        cookies: { sid: "yyy" },
      },
    });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
  });

  it("scrubs Authorization / Cookie / X-Signature headers", () => {
    const ev = makeEvent({
      request: {
        headers: {
          Authorization: "Bearer xxx",
          Cookie: "auth=yyy",
          "X-Signature": "hmac-zzz",
          "Content-Type": "application/json",
        },
      },
    });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.request?.headers?.["Authorization"]).toBe("[redacted]");
    expect(out.request?.headers?.["Cookie"]).toBe("[redacted]");
    expect(out.request?.headers?.["X-Signature"]).toBe("[redacted]");
    expect(out.request?.headers?.["Content-Type"]).toBe("application/json");
  });

  it("masks telegram bot token embedded in exception.value", () => {
    const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const ev = makeEvent({
      exception: {
        values: [
          {
            type: "TelegramError",
            value: `sendMessage failed with token ${token}`,
          },
        ],
      },
    });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.exception?.values?.[0]?.value).toBe(
      "sendMessage failed with token [telegram-token redacted]",
    );
  });

  it("masks email in event.message", () => {
    const ev = makeEvent({ message: "approval routed to ops@sergeant.app" });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.message).toBe(
      "approval routed to [email redacted]@sergeant.app",
    );
  });

  it("scrubs sensitive query params in event.request.url", () => {
    const ev = makeEvent({
      request: { url: "https://api.example.com/?token=secret&ok=1" },
    });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.request?.url).toBe(
      "https://api.example.com/?token=[redacted]&ok=1",
    );
  });

  it("normalises event.user to { id } only", () => {
    const ev = makeEvent({
      user: { id: "u-1", email: "leak@x.com", username: "leak" },
    });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.user).toEqual({ id: "u-1" });
  });

  it("recursively scrubs event.extra (Sentry.captureException({ extra }))", () => {
    const ev = makeEvent({
      extra: {
        payload: { token: "leaked", note: "keep" },
      },
    });
    const out = applyOpenclawBeforeSend(ev);
    const payload = (out.extra as { payload: Record<string, unknown> }).payload;
    expect(payload["token"]).toBe("[redacted]");
    expect(payload["note"]).toBe("keep");
  });

  it("scrubs breadcrumb.data + breadcrumb.message", () => {
    const ev = makeEvent({
      breadcrumbs: [
        {
          category: "http",
          message: "GET /admin failed for user@example.com",
          data: { Authorization: "Bearer xxx" },
        },
      ],
    });
    const out = applyOpenclawBeforeSend(ev);
    expect(out.breadcrumbs?.[0]?.message).toBe(
      "GET /admin failed for [email redacted]@example.com",
    );
    expect(out.breadcrumbs?.[0]?.data?.["Authorization"]).toBe("[redacted]");
  });
});

describe("OPENCLAW_SENTRY_DENY_URLS", () => {
  it("exposes health-probe URLs (parity with server SENTRY_DENY_URLS)", () => {
    expect(OPENCLAW_SENTRY_DENY_URLS).toContain("/api/health");
    expect(OPENCLAW_SENTRY_DENY_URLS).toContain("/health");
  });
});
