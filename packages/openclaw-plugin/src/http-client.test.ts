import { describe, it, expect } from "vitest";
import { OpenClawHttpClient, OpenClawHttpError } from "./http-client.js";

const API_KEY = "x".repeat(32);

function makeFetch(
  handler: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof globalThis.fetch {
  return ((input, init) =>
    handler(
      input as string | URL | Request,
      init as RequestInit | undefined,
    )) as typeof globalThis.fetch;
}

describe("OpenClawHttpClient.post", () => {
  it("posts JSON to /api/internal/openclaw/<path> with bearer auth", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = makeFetch(async (input, init) => {
      calls.push({
        url: typeof input === "string" ? input : input.toString(),
        init,
      });
      return new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new OpenClawHttpClient({
      baseUrl: "http://localhost:3000/",
      apiKey: API_KEY,
      fetchImpl,
    });

    const result = await client.post<{ ok: boolean; value: number }>("recall", {
      founderUserId: "user_x",
      query: "hello",
    });

    expect(result).toEqual({ ok: true, value: 42 });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("no call captured");
    expect(call.url).toBe("http://localhost:3000/api/internal/openclaw/recall");
    expect(call.init?.method).toBe("POST");
    expect(
      (call.init?.headers as Record<string, string>)["authorization"],
    ).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(String(call.init?.body))).toEqual({
      founderUserId: "user_x",
      query: "hello",
    });
  });

  it("respects fully-qualified /api/internal/openclaw paths without double-prefixing", async () => {
    const fetchImpl = makeFetch(
      async () => new Response("{}", { status: 200 }),
    );
    const captured: string[] = [];
    const client = new OpenClawHttpClient({
      baseUrl: "http://x.local",
      apiKey: API_KEY,
      fetchImpl: makeFetch(async (input) => {
        captured.push(typeof input === "string" ? input : input.toString());
        return new Response("{}", { status: 200 });
      }),
    });
    void fetchImpl;

    await client.post("/api/internal/openclaw/budget", {});
    expect(captured).toEqual(["http://x.local/api/internal/openclaw/budget"]);
  });

  it("throws OpenClawHttpError on non-2xx with status + response preview", async () => {
    const fetchImpl = makeFetch(
      async () => new Response("forbidden: allowlist_fail", { status: 403 }),
    );
    const client = new OpenClawHttpClient({
      baseUrl: "http://localhost:3000",
      apiKey: API_KEY,
      fetchImpl,
    });

    await expect(client.post("recall", {})).rejects.toMatchObject({
      name: "OpenClawHttpError",
      status: 403,
      responseText: expect.stringContaining("allowlist_fail"),
    });
  });

  it("throws OpenClawHttpError on invalid JSON response", async () => {
    const fetchImpl = makeFetch(
      async () =>
        new Response("not-json{{{", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new OpenClawHttpClient({
      baseUrl: "http://localhost:3000",
      apiKey: API_KEY,
      fetchImpl,
    });

    await expect(client.post("recall", {})).rejects.toThrow(/not valid JSON/);
  });

  it("aborts request on timeout and reports it", async () => {
    const fetchImpl = makeFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const client = new OpenClawHttpClient({
      baseUrl: "http://localhost:3000",
      apiKey: API_KEY,
      fetchImpl,
      timeoutMs: 5,
    });

    await expect(client.post("recall", {})).rejects.toMatchObject({
      name: "OpenClawHttpError",
      status: 408,
    });
  });

  it("wraps OpenClawHttpError instance with expected fields", () => {
    const err = new OpenClawHttpError({
      endpoint: "http://x/api/internal/openclaw/recall",
      status: 500,
      message: "boom",
      responseText: "stack trace here",
    });
    expect(err.name).toBe("OpenClawHttpError");
    expect(err.message).toBe("boom");
    expect(err.endpoint).toContain("recall");
    expect(err.status).toBe(500);
    expect(err.responseText).toBe("stack trace here");
  });
});
