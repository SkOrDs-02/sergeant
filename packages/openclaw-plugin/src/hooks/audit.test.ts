/**
 * Unit tests for `InvocationCorrelator` + `before_agent_start` and
 * `agent_end` hook factories (Stage 4a).
 *
 * Coverage:
 *   - Correlator semantics (set / consume / size / clear).
 *   - `before_agent_start` opens an invocation and populates correlator;
 *     soft-skips when runId or founderTgUserId is missing;
 *     soft-fails on HTTP error without throwing.
 *   - `agent_end` finalizes with rollup numbers and clears correlator;
 *     skips when no open row matches; truncates oversized strings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawHttpClient } from "../http-client.js";
import {
  InvocationCorrelator,
  createAgentEndHook,
  createBeforeAgentStartHook,
} from "./audit.js";

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

function makeFetch(responses: Array<{ status?: number; body: unknown }>): {
  fetchImpl: typeof globalThis.fetch;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let cursor = 0;
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
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
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InvocationCorrelator", () => {
  it("set + consume returns the stored id and removes the entry", () => {
    const c = new InvocationCorrelator();
    c.set("run_A", 42);
    c.set("run_B", 99);
    expect(c.size()).toBe(2);

    expect(c.consume("run_A")).toBe(42);
    expect(c.consume("run_A")).toBeUndefined();
    expect(c.size()).toBe(1);

    expect(c.consume("run_B")).toBe(99);
    expect(c.size()).toBe(0);
  });

  it("clear() empties the map", () => {
    const c = new InvocationCorrelator();
    c.set("run_X", 1);
    c.set("run_Y", 2);
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.consume("run_X")).toBeUndefined();
  });
});

describe("createBeforeAgentStartHook", () => {
  it("POSTs /invocations/open and stores invocationId in correlator", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { invocationId: 123 } }]);
    const correlator = new InvocationCorrelator();
    const hook = createBeforeAgentStartHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    await hook({
      runId: "run_open",
      trigger: "dm",
      userMessage: "Привіт",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/invocations/open",
    );
    expect(calls[0]!.body).toEqual({
      founderUserId: "user_test",
      founderTgUserId: 42,
      trigger: "dm",
      userMessage: "Привіт",
    });
    expect(correlator.consume("run_open")).toBe(123);
  });

  it("falls back to trigger=dm when payload trigger is not in enum", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { invocationId: 1 } }]);
    const correlator = new InvocationCorrelator();
    const hook = createBeforeAgentStartHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    await hook({
      runId: "run_unknown_trigger",
      trigger: "some_unknown_trigger_value",
      userMessage: "ping",
    });

    expect(calls[0]!.body["trigger"]).toBe("dm");
  });

  it("soft-skips when runId is missing (no HTTP call)", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { invocationId: 1 } }]);
    const correlator = new InvocationCorrelator();
    const hook = createBeforeAgentStartHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    await hook({ trigger: "dm", userMessage: "no run id" });

    expect(calls).toHaveLength(0);
    expect(correlator.size()).toBe(0);
  });

  it("soft-skips when founderTgUserId is missing (env not wired)", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { invocationId: 1 } }]);
    const correlator = new InvocationCorrelator();
    const hook = createBeforeAgentStartHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      correlator,
    });

    await hook({ runId: "run_no_tg", trigger: "dm", userMessage: "x" });

    expect(calls).toHaveLength(0);
    expect(correlator.size()).toBe(0);
  });

  it("logs and continues when /invocations/open returns 500", async () => {
    const { fetchImpl } = makeFetch([{ status: 500, body: { error: "boom" } }]);
    const correlator = new InvocationCorrelator();
    const log = vi.fn();
    const hook = createBeforeAgentStartHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
      log,
    });

    await expect(
      hook({ runId: "run_err", trigger: "dm", userMessage: "x" }),
    ).resolves.toBeUndefined();
    expect(correlator.size()).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "error",
      "sergeant.invocation.open_failed",
      expect.objectContaining({ runId: "run_err" }),
    );
  });
});

describe("createAgentEndHook", () => {
  it("POSTs /invocations/finalize with rollup numbers and clears correlator", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { ok: true } }]);
    const correlator = new InvocationCorrelator();
    correlator.set("run_end", 777);
    const hook = createAgentEndHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    await hook({
      runId: "run_end",
      status: "success",
      costUsd: 0.0123,
      durationMs: 1450.7,
      iterations: 3,
      assistantResponse: "Hello from agent.",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/invocations/finalize",
    );
    expect(calls[0]!.body).toEqual({
      invocationId: 777,
      status: "success",
      costUsd: 0.0123,
      durationMs: 1450,
      iterations: 3,
      assistantResponse: "Hello from agent.",
    });
    expect(correlator.consume("run_end")).toBeUndefined();
  });

  it("falls back to status=success when payload status is out-of-enum", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { ok: true } }]);
    const correlator = new InvocationCorrelator();
    correlator.set("run_x", 10);
    const hook = createAgentEndHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    await hook({ runId: "run_x", status: "garbage_status" });

    expect(calls[0]!.body["status"]).toBe("success");
  });

  it("skips POST when no open row matches runId", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { ok: true } }]);
    const correlator = new InvocationCorrelator();
    const hook = createAgentEndHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    await hook({ runId: "run_orphan", status: "success" });

    expect(calls).toHaveLength(0);
  });

  it("truncates oversized assistantResponse before POSTing", async () => {
    const { fetchImpl, calls } = makeFetch([{ body: { ok: true } }]);
    const correlator = new InvocationCorrelator();
    correlator.set("run_big", 1);
    const hook = createAgentEndHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      correlator,
    });

    const huge = "x".repeat(20_000);
    await hook({
      runId: "run_big",
      status: "success",
      assistantResponse: huge,
    });

    expect((calls[0]!.body["assistantResponse"] as string).length).toBe(16_000);
  });
});
