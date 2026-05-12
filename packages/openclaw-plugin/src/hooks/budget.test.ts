/**
 * Unit tests for `createBudgetGate` (`llm_input` hook factory, Stage 4a).
 *
 * The handler is pure modulo the injected `OpenClawHttpClient`, so tests
 * stub `fetch` on the global, build a real client, and assert:
 *
 *   - Server `allowed: true` → handler returns `undefined` (pass-through).
 *   - Server `allowed: false` → returns `{ block, blockReason }`.
 *   - HTTP/network error → fail-closed `{ block, blockReason }`.
 *   - Endpoint path is the canonical `/api/internal/openclaw/budget`.
 *   - Bearer auth header is forwarded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawHttpClient } from "../http-client.js";
import { createBudgetGate, type BudgetCheckResponse } from "./budget.js";

interface CapturedCall {
  url: string;
  body: unknown;
  authorization: string | null;
}

function makeFetch(responses: Array<{ status?: number; body: unknown }>): {
  fetchImpl: typeof globalThis.fetch;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let cursor = 0;
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    const rawBody = init?.body;
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      body,
      authorization: headers.get("authorization"),
    });
    const r = responses[cursor++] ?? responses[responses.length - 1];
    if (!r) {
      return new Response(JSON.stringify({}), { status: 500 });
    }
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

function makeClient(fetchImpl: typeof globalThis.fetch): OpenClawHttpClient {
  return new OpenClawHttpClient({
    baseUrl: "http://server.local",
    apiKey: "x".repeat(32),
    fetchImpl,
  });
}

beforeEach(() => {
  // Silence the fallback console.* logger so test output stays readable.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBudgetGate", () => {
  it("returns undefined when server allows the call", async () => {
    const ok: BudgetCheckResponse = {
      allowed: true,
      spentUsd: 1.23,
      budgetUsd: 5,
      remainingUsd: 3.77,
    };
    const { fetchImpl, calls } = makeFetch([{ body: ok }]);
    const hook = createBudgetGate({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
    });

    const result = await hook({ runId: "run_1" });

    expect(result).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/budget",
    );
    expect(calls[0]!.body).toEqual({ founderUserId: "user_test" });
    expect(calls[0]!.authorization).toBe(`Bearer ${"x".repeat(32)}`);
  });

  it("forwards optional tzName when provided", async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        body: {
          allowed: true,
          spentUsd: 0,
          budgetUsd: 5,
          remainingUsd: 5,
        } satisfies BudgetCheckResponse,
      },
    ]);
    const hook = createBudgetGate({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      tzName: "America/New_York",
    });

    await hook({ runId: "run_1" });

    expect(calls[0]!.body).toEqual({
      founderUserId: "user_test",
      tzName: "America/New_York",
    });
  });

  it("returns block payload when server denies the call", async () => {
    const denied: BudgetCheckResponse = {
      allowed: false,
      spentUsd: 4.95,
      budgetUsd: 5,
      remainingUsd: 0.05,
      reason: "budget_exceeded",
    };
    const { fetchImpl } = makeFetch([{ body: denied }]);
    const log = vi.fn();
    const hook = createBudgetGate({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      log,
    });

    const result = await hook({ runId: "run_blocked" });

    expect(result).toMatchObject({ block: true });
    expect(result?.blockReason).toContain("$4.95");
    expect(result?.blockReason).toContain("$5.00");
    expect(result?.blockReason).toContain("budget_exceeded");
    expect(log).toHaveBeenCalledWith(
      "warn",
      "sergeant.budget.blocked",
      expect.objectContaining({
        runId: "run_blocked",
        spentUsd: 4.95,
        budgetUsd: 5,
        remainingUsd: 0.05,
        serverReason: "budget_exceeded",
      }),
    );
  });

  it("fails closed on transport error (5xx)", async () => {
    const { fetchImpl } = makeFetch([{ status: 503, body: {} }]);
    const log = vi.fn();
    const hook = createBudgetGate({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      log,
    });

    const result = await hook({ runId: "run_err" });

    expect(result).toMatchObject({ block: true });
    expect(result?.blockReason).toContain("503");
    expect(log).toHaveBeenCalledWith(
      "error",
      "sergeant.budget.error",
      expect.objectContaining({ runId: "run_err" }),
    );
  });

  it("fails closed on network error", async () => {
    const fetchImpl: typeof globalThis.fetch = async () => {
      throw new TypeError("network down");
    };
    const log = vi.fn();
    const hook = createBudgetGate({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      log,
    });

    const result = await hook({});

    expect(result).toMatchObject({ block: true });
    expect(log).toHaveBeenCalledWith(
      "error",
      "sergeant.budget.error",
      expect.objectContaining({ error: expect.stringContaining("network") }),
    );
  });
});
