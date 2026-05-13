import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturePostHogEvent } from "./posthogCapture.js";
import {
  externalHttpRequestsTotal,
  externalHttpDurationMs,
} from "../obs/metrics.js";

function makeFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
) {
  return vi.fn(impl) as unknown as typeof fetch;
}

function ok(status = 200, body = ""): Response {
  return new Response(body, { status });
}

function errorResponse(status: number, body = ""): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("capturePostHogEvent — happy path", () => {
  beforeEach(() => {
    externalHttpRequestsTotal.reset();
    externalHttpDurationMs.reset();
    delete process.env["POSTHOG_PROJECT_API_KEY"];
    delete process.env["POSTHOG_HOST"];
  });

  it("POSTs JSON body to /capture/ with api_key, event, distinct_id, properties", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    const r = await capturePostHogEvent(
      {
        event: "subscription_started",
        distinctId: "user-123",
        properties: { plan: "pro", currency: "USD" },
      },
      {
        apiKey: "phc_test",
        host: "https://eu.i.posthog.com",
        fetchImpl,
      },
    );

    expect(r.outcome).toBe("ok");
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;
    expect(url).toBe("https://eu.i.posthog.com/capture/");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body["api_key"]).toBe("phc_test");
    expect(body["event"]).toBe("subscription_started");
    expect(body["distinct_id"]).toBe("user-123");
    expect(body["properties"]).toEqual({ plan: "pro", currency: "USD" });
    expect(typeof body["timestamp"]).toBe("string");
  });

  it("includes uuid in payload when caller provides one (server-side dedup)", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    await capturePostHogEvent(
      {
        event: "subscription_started",
        distinctId: "user-1",
        uuid: "evt_stripe_xyz",
      },
      { apiKey: "phc_test", fetchImpl },
    );
    const [, init] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body["uuid"]).toBe("evt_stripe_xyz");
  });

  it("strips trailing slashes from custom host", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    await capturePostHogEvent(
      { event: "e", distinctId: "u1" },
      {
        apiKey: "k",
        host: "https://custom.posthog.example.com///",
        fetchImpl,
      },
    );
    const [url] = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock
      .calls[0]!;
    expect(url).toBe("https://custom.posthog.example.com/capture/");
  });

  it("uses caller-supplied timestamp when provided", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    await capturePostHogEvent(
      {
        event: "e",
        distinctId: "u1",
        timestamp: "2026-05-13T10:00:00.000Z",
      },
      { apiKey: "k", fetchImpl },
    );
    const [, init] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body["timestamp"]).toBe("2026-05-13T10:00:00.000Z");
  });
});

describe("capturePostHogEvent — outcome classification", () => {
  beforeEach(() => {
    externalHttpRequestsTotal.reset();
    externalHttpDurationMs.reset();
    delete process.env["POSTHOG_PROJECT_API_KEY"];
  });

  it("returns skipped when POSTHOG_PROJECT_API_KEY is not configured", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    const r = await capturePostHogEvent(
      { event: "e", distinctId: "u1" },
      { fetchImpl },
    );
    expect(r.outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("429 → rate_limited", async () => {
    const fetchImpl = makeFetch(async () => errorResponse(429));
    const r = await capturePostHogEvent(
      { event: "e", distinctId: "u1" },
      { apiKey: "k", fetchImpl },
    );
    expect(r.outcome).toBe("rate_limited");
    expect(r.status).toBe(429);
  });

  it("5xx → error (caller continues; analytics is best-effort)", async () => {
    const fetchImpl = makeFetch(async () =>
      errorResponse(503, '{"detail":"upstream"}'),
    );
    const r = await capturePostHogEvent(
      { event: "e", distinctId: "u1" },
      { apiKey: "k", fetchImpl },
    );
    expect(r.outcome).toBe("error");
    expect(r.status).toBe(503);
  });

  it("aborted fetch → timeout", async () => {
    const fetchImpl = makeFetch(async (_url, init) => {
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const r = await capturePostHogEvent(
      { event: "e", distinctId: "u1" },
      { apiKey: "k", fetchImpl, timeoutMs: 5 },
    );
    expect(r.outcome).toBe("timeout");
  });

  it("network error → error (no throw to caller)", async () => {
    const fetchImpl = makeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const r = await capturePostHogEvent(
      { event: "e", distinctId: "u1" },
      { apiKey: "k", fetchImpl },
    );
    expect(r.outcome).toBe("error");
    expect(r.error).toContain("ECONNREFUSED");
  });

  it("missing event → error (caller-side validation)", async () => {
    const r = await capturePostHogEvent(
      { event: "", distinctId: "u1" },
      { apiKey: "k" },
    );
    expect(r.outcome).toBe("error");
  });

  it("missing distinctId → error", async () => {
    const r = await capturePostHogEvent(
      { event: "e", distinctId: "" },
      { apiKey: "k" },
    );
    expect(r.outcome).toBe("error");
  });
});
