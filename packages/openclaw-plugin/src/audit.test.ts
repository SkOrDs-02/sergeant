import { describe, it, expect, vi } from "vitest";
import {
  InvocationCorrelator,
  createAgentTurnStartHook,
  createAgentTurnEndHook,
} from "./audit.js";
import { OpenClawHttpClient } from "./http-client.js";
import type {
  AgentTurnStartContext,
  AgentTurnEndContext,
} from "./sdk-types.js";

const API_KEY = "x".repeat(32);

const startCtx: AgentTurnStartContext = {
  invocationId: "_unused_",
  agentRunId: "run_abc",
  founderUserId: "user_test",
  trigger: "dm",
  userMessage: "What is our runway?",
};

const endCtxBase: AgentTurnEndContext = {
  invocationId: "_unused_",
  agentRunId: "run_abc",
  founderUserId: "user_test",
  status: "success",
  costUsd: 0.07,
  durationMs: 1234,
  iterations: 2,
  assistantResponse: "Cash 50k, burn 5k → 10mo",
};

describe("InvocationCorrelator", () => {
  it("sets, consumes, clears entries", () => {
    const c = new InvocationCorrelator();
    c.set("a", 100);
    c.set("b", 200);
    expect(c.size()).toBe(2);
    expect(c.consume("a")).toBe(100);
    expect(c.consume("a")).toBeUndefined();
    expect(c.size()).toBe(1);
    c.clear();
    expect(c.size()).toBe(0);
  });
});

describe("createAgentTurnStartHook", () => {
  it("calls /invocations/open and stores returned id keyed by agentRunId", async () => {
    let bodyCaptured: unknown = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        bodyCaptured = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(JSON.stringify({ invocationId: 4242 }), { status: 200 }),
        );
      }) as typeof globalThis.fetch,
    });
    const correlator = new InvocationCorrelator();
    const hook = createAgentTurnStartHook({
      http,
      founderUserId: "user_test",
      correlator,
    });

    const result = await hook(startCtx);
    expect(result).toEqual({ ok: true });
    expect(correlator.consume("run_abc")).toBe(4242);
    expect(bodyCaptured).toEqual({
      founderUserId: "user_test",
      trigger: "dm",
      userMessage: "What is our runway?",
      agentRunId: "run_abc",
    });
  });

  it("soft-fails (returns ok:true) and logs when /open errors", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () => Promise.resolve(new Response("oops", { status: 500 })),
    });
    const correlator = new InvocationCorrelator();
    const log = vi.fn();
    const hook = createAgentTurnStartHook({
      http,
      founderUserId: "user_test",
      correlator,
      log,
    });

    const result = await hook(startCtx);
    expect(result).toEqual({ ok: true });
    expect(correlator.size()).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.invocation.open_failed",
      expect.any(Object),
    );
  });
});

describe("createAgentTurnEndHook", () => {
  it("finalizes invocation with full cost+status payload and consumes correlator entry", async () => {
    let bodyCaptured: unknown = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        bodyCaptured = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      }) as typeof globalThis.fetch,
    });
    const correlator = new InvocationCorrelator();
    correlator.set("run_abc", 4242);
    const hook = createAgentTurnEndHook({
      http,
      founderUserId: "user_test",
      correlator,
    });

    const result = await hook(endCtxBase);
    expect(result).toEqual({ ok: true });
    expect(bodyCaptured).toEqual({
      invocationId: 4242,
      status: "success",
      costUsd: 0.07,
      durationMs: 1234,
      iterations: 2,
      assistantResponse: "Cash 50k, burn 5k → 10mo",
    });
    expect(correlator.size()).toBe(0);
  });

  it("falls back to agentRunId when correlator entry is missing", async () => {
    let bodyCaptured: unknown = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        bodyCaptured = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      }) as typeof globalThis.fetch,
    });
    const correlator = new InvocationCorrelator();
    const hook = createAgentTurnEndHook({
      http,
      founderUserId: "user_test",
      correlator,
    });

    await hook(endCtxBase);
    expect(bodyCaptured).toMatchObject({
      invocationId: -1,
      agentRunId: "run_abc",
    });
  });

  it("propagates non-success status (budget_exceeded) verbatim to /finalize", async () => {
    let bodyCaptured: unknown = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        bodyCaptured = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      }) as typeof globalThis.fetch,
    });
    const correlator = new InvocationCorrelator();
    correlator.set("run_abc", 50);
    const hook = createAgentTurnEndHook({
      http,
      founderUserId: "user_test",
      correlator,
    });

    await hook({
      ...endCtxBase,
      status: "budget_exceeded",
      assistantResponse: null,
      iterations: 0,
    });

    expect(bodyCaptured).toMatchObject({
      invocationId: 50,
      status: "budget_exceeded",
      iterations: 0,
    });
    expect(bodyCaptured).not.toHaveProperty("assistantResponse");
  });

  it("soft-fails on /finalize HTTP error so turn doesn't get blocked", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
    });
    const correlator = new InvocationCorrelator();
    correlator.set("run_abc", 99);
    const log = vi.fn();
    const hook = createAgentTurnEndHook({
      http,
      founderUserId: "user_test",
      correlator,
      log,
    });

    const result = await hook(endCtxBase);
    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.invocation.finalize_failed",
      expect.any(Object),
    );
  });
});
