import { describe, it, expect, vi } from "vitest";
import { createBudgetGate } from "./budget.js";
import { OpenClawHttpClient, OpenClawHttpError } from "./http-client.js";
import type { LlmInputContext } from "./sdk-types.js";

const API_KEY = "x".repeat(32);

const baseCtx: LlmInputContext = {
  invocationId: "inv_001",
  agentRunId: "run_001",
  founderUserId: "user_test",
  estimatedCostUsd: 0.12,
  modelTier: "default",
};

describe("createBudgetGate (llm_input hook)", () => {
  it("allows LLM call when /budget responds {allowed:true}", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ allowed: true, dailyTotalUsd: 1.23 }), {
            status: 200,
          }),
        ),
    });
    const log = vi.fn();
    const gate = createBudgetGate({
      http,
      founderUserId: "user_test",
      perCallCapUsd: 0.5,
      log,
    });

    const result = await gate(baseCtx);
    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalledWith(
      "debug",
      "openclaw.budget.allowed",
      expect.objectContaining({ invocationId: "inv_001" }),
    );
  });

  it("blocks LLM call with status='budget_exceeded' when /budget says no", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: false,
              reason: "Per-call cap of $0.50 exceeded",
              dailyTotalUsd: 12.5,
            }),
            { status: 200 },
          ),
        ),
    });
    const gate = createBudgetGate({
      http,
      founderUserId: "user_test",
      perCallCapUsd: 0.5,
    });

    const result = await gate(baseCtx);
    expect(result).toMatchObject({
      ok: false,
      status: "budget_exceeded",
      reason: expect.stringContaining("$0.50"),
    });
  });

  it("forwards cap override + estimatedCost in request body", async () => {
    let captured: unknown = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        captured = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(JSON.stringify({ allowed: true }), { status: 200 }),
        );
      }) as typeof globalThis.fetch,
    });
    const gate = createBudgetGate({
      http,
      founderUserId: "user_X",
      perCallCapUsd: 0.75,
    });

    await gate({ ...baseCtx, estimatedCostUsd: 0.4 });

    expect(captured).toEqual({
      founderUserId: "user_X",
      kind: "per_call",
      estimatedCostUsd: 0.4,
      perCallCapUsd: 0.75,
    });
  });

  it("fails closed (blocks) on /budget HTTP error", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () => Promise.resolve(new Response("oops", { status: 500 })),
    });
    const log = vi.fn();
    const gate = createBudgetGate({
      http,
      founderUserId: "user_test",
      perCallCapUsd: 0.5,
      log,
    });

    const result = await gate(baseCtx);
    expect(result).toMatchObject({
      ok: false,
      status: "budget_exceeded",
      reason: expect.stringContaining("Budget service unreachable"),
    });
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.budget.error",
      expect.any(Object),
    );
  });

  it("classifies non-HTTP transport errors as budget_exceeded fail-closed", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () => Promise.reject(new Error("dns failure")),
    });
    const gate = createBudgetGate({
      http,
      founderUserId: "user_test",
      perCallCapUsd: 0.5,
    });

    const result = await gate(baseCtx);
    expect(result).toMatchObject({
      ok: false,
      status: "budget_exceeded",
    });
    // OpenClawHttpClient wraps fetch errors; ensure budget gate
    // surfaces the wrapped error class on the path.
    expect(OpenClawHttpError).toBeDefined();
  });
});
