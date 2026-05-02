import { describe, it, expect, beforeEach, vi } from "vitest";
import { deletePostHogPerson } from "./posthog.js";
import {
  externalHttpRequestsTotal,
  externalHttpDurationMs,
  register,
} from "../obs/metrics.js";

function makeFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
) {
  return vi.fn(impl) as unknown as typeof fetch;
}

function ok(status = 200): Response {
  return new Response(null, { status });
}

function jsonError(status: number, body: string = ""): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("deletePostHogPerson — happy path", () => {
  beforeEach(() => {
    externalHttpRequestsTotal.reset();
    externalHttpDurationMs.reset();
  });

  it("returns ok on 2xx and DELETEs to /api/projects/:id/persons/?distinct_id", async () => {
    const fetchImpl = makeFetch(async () => ok(204));
    const r = await deletePostHogPerson("user-123", {
      apiKey: "phx_test",
      projectId: "42",
      host: "https://eu.i.posthog.com",
      fetchImpl,
    });

    expect(r.outcome).toBe("ok");
    expect(r.status).toBe(204);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (
      fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0];
    expect(url).toBe(
      "https://eu.i.posthog.com/api/projects/42/persons/?distinct_id=user-123",
    );
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer phx_test",
    );
  });

  it("URL-encodes both projectId and userId", async () => {
    const fetchImpl = makeFetch(async () => ok(204));
    await deletePostHogPerson("user@example.com", {
      apiKey: "k",
      projectId: "proj id/with space",
      host: "https://eu.i.posthog.com",
      fetchImpl,
    });
    const [url] = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock
      .calls[0];
    expect(url).toContain("/api/projects/proj%20id%2Fwith%20space/persons/");
    expect(url).toContain("?distinct_id=user%40example.com");
  });

  it("strips trailing slashes from custom host", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      host: "https://custom.posthog.example.com///",
      fetchImpl,
    });
    const [url] = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock
      .calls[0];
    expect(url).toBe(
      "https://custom.posthog.example.com/api/projects/1/persons/?distinct_id=u1",
    );
  });
});

describe("deletePostHogPerson — outcome classification", () => {
  it("404 → not_found (idempotent: already deleted)", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonError(404, '{"detail":"not found"}'),
    );
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("not_found");
    expect(r.status).toBe(404);
  });

  it("429 → rate_limited", async () => {
    const fetchImpl = makeFetch(async () => jsonError(429, "rate limited"));
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("rate_limited");
    expect(r.status).toBe(429);
  });

  it("500 → error with status and body in result", async () => {
    const fetchImpl = makeFetch(async () => jsonError(500, "internal"));
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("error");
    expect(r.status).toBe(500);
    expect(r.error).toMatch(/500/);
  });

  it("403 (auth/permissions) → error", async () => {
    const fetchImpl = makeFetch(async () => jsonError(403, "forbidden"));
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("error");
    expect(r.status).toBe(403);
  });

  it("network exception → error (not timeout)", async () => {
    const fetchImpl = makeFetch(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("error");
    expect(r.error).toBe("ECONNRESET");
  });

  it("AbortError → timeout", async () => {
    const fetchImpl = makeFetch(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("timeout");
  });
});

describe("deletePostHogPerson — config gating", () => {
  it("returns skipped without API key, never calling fetch", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    const r = await deletePostHogPerson("u1", {
      apiKey: undefined,
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns skipped without project ID", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    const r = await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: undefined,
      fetchImpl,
    });
    expect(r.outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to env vars when options omitted", async () => {
    const prevKey = process.env.POSTHOG_API_KEY;
    const prevProj = process.env.POSTHOG_PROJECT_ID;
    const prevHost = process.env.POSTHOG_HOST;
    process.env.POSTHOG_API_KEY = "phx_env";
    process.env.POSTHOG_PROJECT_ID = "777";
    process.env.POSTHOG_HOST = "https://eu.i.posthog.com";
    try {
      const fetchImpl = makeFetch(async () => ok(204));
      const r = await deletePostHogPerson("u-env", { fetchImpl });
      expect(r.outcome).toBe("ok");
      const [url, init] = (
        fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls[0];
      expect(url).toBe(
        "https://eu.i.posthog.com/api/projects/777/persons/?distinct_id=u-env",
      );
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer phx_env",
      );
    } finally {
      // process.env coerces values to string, so assigning `undefined`
      // would set it literally to the string "undefined". `delete` is the
      // only way to actually unset.
      if (prevKey === undefined) delete process.env.POSTHOG_API_KEY;
      else process.env.POSTHOG_API_KEY = prevKey;
      if (prevProj === undefined) delete process.env.POSTHOG_PROJECT_ID;
      else process.env.POSTHOG_PROJECT_ID = prevProj;
      if (prevHost === undefined) delete process.env.POSTHOG_HOST;
      else process.env.POSTHOG_HOST = prevHost;
    }
  });
});

describe("deletePostHogPerson — input validation", () => {
  it("rejects empty userId", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    const r = await deletePostHogPerson("", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    expect(r.outcome).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("deletePostHogPerson — metrics", () => {
  beforeEach(() => {
    externalHttpRequestsTotal.reset();
    externalHttpDurationMs.reset();
  });

  it("emits external_http_requests_total{upstream=posthog,outcome=ok} on 200", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    const text = await register.metrics();
    expect(text).toMatch(
      /external_http_requests_total\{upstream="posthog",outcome="ok"\} 1/,
    );
  });

  it("emits outcome=not_found on 404", async () => {
    const fetchImpl = makeFetch(async () => jsonError(404));
    await deletePostHogPerson("u1", {
      apiKey: "k",
      projectId: "1",
      fetchImpl,
    });
    const text = await register.metrics();
    expect(text).toMatch(
      /external_http_requests_total\{upstream="posthog",outcome="not_found"\} 1/,
    );
  });

  it("emits outcome=skipped when config missing (no http roundtrip)", async () => {
    const fetchImpl = makeFetch(async () => ok(200));
    await deletePostHogPerson("u1", {
      apiKey: undefined,
      projectId: undefined,
      fetchImpl,
    });
    const text = await register.metrics();
    expect(text).toMatch(
      /external_http_requests_total\{upstream="posthog",outcome="skipped"\} 1/,
    );
  });
});
