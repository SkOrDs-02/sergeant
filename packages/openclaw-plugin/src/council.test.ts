/**
 * Coverage for `council.ts` (PR-E Phase 5):
 *   - `COUNCIL_DEFAULT_SEQUENCE` exposes the Locked decision #8 order.
 *   - `COUNCIL_SYNTHESIS_PERSONA` is the last entry (`cofounder`).
 *   - `createCouncilBudgetGate` allows when remaining ≥ council cap,
 *     refuses when daily cap exceeded, refuses when headroom < cap, and
 *     fails closed on HTTP / transport errors.
 */

import { describe, it, expect, vi } from "vitest";
import {
  COUNCIL_DEFAULT_SEQUENCE,
  COUNCIL_SYNTHESIS_PERSONA,
  COUNCIL_SYNTHESIS_STEP_LABEL,
  createCouncilBudgetGate,
} from "./council.js";
import { OpenClawHttpClient } from "./http-client.js";

const API_KEY = "x".repeat(32);

describe("COUNCIL_DEFAULT_SEQUENCE", () => {
  it("matches Locked decision #8 — devops → eng → pm → growth → finance → cofounder", () => {
    expect([...COUNCIL_DEFAULT_SEQUENCE]).toEqual([
      "devops",
      "eng",
      "pm",
      "growth",
      "finance",
      "cofounder",
    ]);
  });

  it("ends with the synthesis persona (cofounder facilitator)", () => {
    expect(COUNCIL_SYNTHESIS_PERSONA).toBe("cofounder");
    expect(COUNCIL_DEFAULT_SEQUENCE[COUNCIL_DEFAULT_SEQUENCE.length - 1]).toBe(
      COUNCIL_SYNTHESIS_PERSONA,
    );
  });

  it("synthesis audit step label is distinct from any persona slug", () => {
    expect(COUNCIL_SYNTHESIS_STEP_LABEL).toBe("synthesis");
    expect(COUNCIL_DEFAULT_SEQUENCE as readonly string[]).not.toContain(
      COUNCIL_SYNTHESIS_STEP_LABEL,
    );
  });
});

describe("createCouncilBudgetGate", () => {
  it("allows the council session when remainingUsd ≥ councilUsdBudget", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              spentUsd: 1.0,
              budgetUsd: 10.0,
              remainingUsd: 9.0,
            }),
            { status: 200 },
          ),
        ),
    });
    const log = vi.fn();
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_test",
      councilUsdBudget: 2.0,
      log,
    });

    const outcome = await gate();
    expect(outcome).toEqual({
      allowed: true,
      remainingUsd: 9.0,
      spentUsd: 1.0,
      budgetUsd: 10.0,
    });
    expect(log).toHaveBeenCalledWith(
      "info",
      "openclaw.council.allowed",
      expect.objectContaining({ remainingUsd: 9.0 }),
    );
  });

  it("blocks when server returns allowed=false (daily cap exhausted)", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: false,
              spentUsd: 10.0,
              budgetUsd: 10.0,
              remainingUsd: 0,
            }),
            { status: 200 },
          ),
        ),
    });
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_test",
      councilUsdBudget: 2.0,
    });

    const outcome = await gate();
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) throw new Error("expected blocked outcome");
    expect(outcome.kind).toBe("daily_cap_exceeded");
    expect(outcome.reason).toContain("$10.00");
  });

  it("blocks when remainingUsd < councilUsdBudget (headroom too low)", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              spentUsd: 8.5,
              budgetUsd: 10.0,
              remainingUsd: 1.5,
            }),
            { status: 200 },
          ),
        ),
    });
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_test",
      councilUsdBudget: 2.0,
    });

    const outcome = await gate();
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) throw new Error("expected blocked outcome");
    expect(outcome.kind).toBe("headroom_below_council_cap");
    expect(outcome.reason).toContain("$2.00");
    expect(outcome.remainingUsd).toBeCloseTo(1.5);
  });

  it("forwards founderUserId + optional tzName in request body", async () => {
    let captured: unknown = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        captured = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              spentUsd: 0,
              budgetUsd: 10,
              remainingUsd: 10,
            }),
            { status: 200 },
          ),
        );
      }) as typeof globalThis.fetch,
    });
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_X",
      councilUsdBudget: 2.0,
      tzName: "Europe/Kyiv",
    });

    await gate();

    expect(captured).toEqual({
      founderUserId: "user_X",
      tzName: "Europe/Kyiv",
    });
  });

  it("omits tzName from body when not provided", async () => {
    let captured: Record<string, unknown> | null = null;
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
        captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              spentUsd: 0,
              budgetUsd: 10,
              remainingUsd: 10,
            }),
            { status: 200 },
          ),
        );
      }) as typeof globalThis.fetch,
    });
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_X",
      councilUsdBudget: 2.0,
    });

    await gate();

    expect(captured).not.toBeNull();
    expect(captured).toEqual({ founderUserId: "user_X" });
    expect(captured && "tzName" in captured).toBe(false);
  });

  it("fails closed (service_error) on HTTP 5xx", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () => Promise.resolve(new Response("oops", { status: 500 })),
    });
    const log = vi.fn();
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_test",
      councilUsdBudget: 2.0,
      log,
    });

    const outcome = await gate();
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) throw new Error("expected blocked outcome");
    expect(outcome.kind).toBe("service_error");
    expect(outcome.reason).toContain("Budget service unreachable");
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.council.service_error",
      expect.any(Object),
    );
  });

  it("fails closed (service_error) on transport error", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () => Promise.reject(new Error("dns failure")),
    });
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_test",
      councilUsdBudget: 2.0,
    });

    const outcome = await gate();
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) throw new Error("expected blocked outcome");
    expect(outcome.kind).toBe("service_error");
    // HttpClient wraps fetch transport errors in OpenClawHttpError(status=0),
    // so the gate reports the same "unreachable" wording it uses for HTTP 5xx.
    expect(outcome.reason).toContain("Budget service unreachable");
  });

  it("derives remainingUsd from budgetUsd - spentUsd when server omits it", async () => {
    const http = new OpenClawHttpClient({
      baseUrl: "http://x",
      apiKey: API_KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              spentUsd: 3.0,
              budgetUsd: 10.0,
              // remainingUsd intentionally omitted — gate must compute
            }),
            { status: 200 },
          ),
        ),
    });
    const gate = createCouncilBudgetGate({
      http,
      founderUserId: "user_test",
      councilUsdBudget: 2.0,
    });

    const outcome = await gate();
    expect(outcome.allowed).toBe(true);
    if (!outcome.allowed) throw new Error("expected allowed outcome");
    expect(outcome.remainingUsd).toBeCloseTo(7.0);
  });
});
