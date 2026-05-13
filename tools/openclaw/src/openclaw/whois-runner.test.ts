import { describe, expect, it, vi } from "vitest";

import {
  executeOpenclawWhoisCommand,
  type WhoisAggregatorResponse,
  type WhoisFetcher,
  type WhoisRunnerDeps,
} from "./whois-runner.js";

const NOW = new Date("2026-05-13T19:30:00.000Z");

interface FetcherCalls {
  open: Array<unknown>;
  finalize: Array<unknown>;
  whois: Array<unknown>;
}

function buildFetcher(opts: {
  lookup?: {
    ok: boolean;
    status: number;
    data: WhoisAggregatorResponse | null;
  };
  openInvocationId?: number | null;
}): { fetcher: WhoisFetcher; calls: FetcherCalls } {
  const calls: FetcherCalls = { open: [], finalize: [], whois: [] };
  // Use `in` check so explicit `null` overrides the default 42 (the
  // "missing invocationId after audit-open" branch is one of our test
  // cases).
  const invocationId =
    "openInvocationId" in opts ? (opts.openInvocationId ?? null) : 42;
  const fetcher: WhoisFetcher = {
    postWhoisLookup: vi.fn(async (input) => {
      calls.whois.push(input);
      return (
        opts.lookup ?? {
          ok: false,
          status: 503,
          data: null,
        }
      );
    }),
    openInvocation: vi.fn(async (input) => {
      calls.open.push(input);
      return {
        ok: true,
        status: 200,
        invocationId,
      };
    }),
    finalizeInvocation: vi.fn(async (input) => {
      calls.finalize.push(input);
      return { ok: true, status: 200 };
    }),
  };
  return { fetcher, calls };
}

function buildDeps(overrides: Partial<WhoisRunnerDeps> = {}): WhoisRunnerDeps {
  return {
    rawArgument: "123456789",
    founderUserId: "user-1",
    founderTgUserId: 999,
    fetcher: buildFetcher({
      lookup: {
        ok: true,
        status: 200,
        data: {
          tgUserId: 123456789,
          resolvedFrom: "numeric",
          username: null,
          firstName: null,
          lastName: null,
          inAllowlist: false,
          isFounder: false,
          invocations7d: 0,
          lastSeenIso: null,
          topTools: [],
          muteState: null,
          telegramError: null,
        },
      },
    }).fetcher,
    now: () => NOW,
    ...overrides,
  };
}

describe("executeOpenclawWhoisCommand — happy path", () => {
  it("opens audit-row, calls aggregator, finalizes success, returns rendered reply", async () => {
    const { fetcher, calls } = buildFetcher({
      lookup: {
        ok: true,
        status: 200,
        data: {
          tgUserId: 999,
          resolvedFrom: "numeric",
          username: "founder",
          firstName: "Founder",
          lastName: null,
          inAllowlist: true,
          isFounder: true,
          invocations7d: 12,
          lastSeenIso: "2026-05-13T17:30:00.000Z",
          topTools: [{ tool: "recall_memory", count: 6 }],
          muteState: null,
          telegramError: null,
        },
      },
    });
    const result = await executeOpenclawWhoisCommand({
      rawArgument: "999",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.invocationId).toBe(42);
    expect(result.subcommand).toBe("whois");
    expect(result.reply).toContain("🦅 OpenClaw whois");
    expect(result.reply).toContain("<code>999</code>");
    expect(result.reply).toContain("Founder");
    expect(result.reply).toContain("@founder");

    expect(calls.open).toHaveLength(1);
    expect(calls.whois).toHaveLength(1);
    expect(calls.finalize).toHaveLength(1);

    const openCall = calls.open[0] as Record<string, unknown>;
    expect(openCall["trigger"]).toBe("dm");
    expect(openCall["metadata"]).toMatchObject({
      slashCommand: "/openclaw",
      subcommand: "whois",
      argKind: "numeric",
    });

    const finalCall = calls.finalize[0] as Record<string, unknown>;
    expect(finalCall["status"]).toBe("success");
  });

  it("dispatches @username arg as username payload (no @)", async () => {
    const { fetcher, calls } = buildFetcher({
      lookup: {
        ok: true,
        status: 200,
        data: {
          tgUserId: 42,
          resolvedFrom: "username",
          username: "foo",
          firstName: "Foo",
          lastName: null,
          inAllowlist: false,
          isFounder: false,
          invocations7d: 0,
          lastSeenIso: null,
          topTools: [],
          muteState: null,
          telegramError: null,
        },
      },
    });
    await executeOpenclawWhoisCommand({
      rawArgument: "@foo",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
    });
    const whoisCall = calls.whois[0] as Record<string, unknown>;
    expect(whoisCall["username"]).toBe("foo");
    expect(whoisCall["tgUserId"]).toBeUndefined();
  });
});

describe("executeOpenclawWhoisCommand — early-return paths", () => {
  it("returns help text + ok=false on empty argument (no audit row)", async () => {
    const { fetcher, calls } = buildFetcher({});
    const result = await executeOpenclawWhoisCommand({
      rawArgument: "",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.invocationId).toBeNull();
    expect(result.reply).toContain("/openclaw whois");
    expect(result.reply).toContain("@username");
    expect(calls.open).toHaveLength(0);
    expect(calls.whois).toHaveLength(0);
    expect(calls.finalize).toHaveLength(0);
  });

  it("returns invalid-arg path with help on bad input", async () => {
    const { fetcher, calls } = buildFetcher({});
    const result = await executeOpenclawWhoisCommand({
      rawArgument: "<<bad>>",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
    });
    expect(result.ok).toBe(false);
    expect(calls.open).toHaveLength(0);
  });
});

describe("executeOpenclawWhoisCommand — endpoint failure", () => {
  it("finalizes status=error and returns HTTP-stub reply on lookup 5xx", async () => {
    const { fetcher, calls } = buildFetcher({
      lookup: { ok: false, status: 503, data: null },
    });
    const result = await executeOpenclawWhoisCommand({
      rawArgument: "123",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("HTTP 503");
    expect(calls.finalize).toHaveLength(1);
    const finalCall = calls.finalize[0] as Record<string, unknown>;
    expect(finalCall["status"]).toBe("error");
    expect(String(finalCall["errorMessage"])).toContain("HTTP 503");
  });

  it("returns reply but skips finalize when invocationId is null", async () => {
    const { fetcher, calls } = buildFetcher({
      lookup: { ok: false, status: 502, data: null },
      openInvocationId: null,
    });
    const result = await executeOpenclawWhoisCommand({
      rawArgument: "123",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
    });
    expect(result.invocationId).toBeNull();
    expect(result.ok).toBe(false);
    expect(calls.finalize).toHaveLength(0);
  });
});

describe("executeOpenclawWhoisCommand — breadcrumbs", () => {
  it("emits start + success breadcrumbs", async () => {
    const seen: Array<{ message: string; level: string }> = [];
    await executeOpenclawWhoisCommand({
      ...buildDeps(),
      addBreadcrumb: (b) => seen.push({ message: b.message, level: b.level }),
    });
    const messages = seen.map((s) => s.message);
    expect(messages).toContain("whois.start");
    expect(messages).toContain("whois.success");
  });

  it("emits endpoint_failed breadcrumb on 5xx", async () => {
    const seen: Array<{ message: string; level: string }> = [];
    const { fetcher } = buildFetcher({
      lookup: { ok: false, status: 503, data: null },
    });
    await executeOpenclawWhoisCommand({
      rawArgument: "123",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      now: () => NOW,
      addBreadcrumb: (b) => seen.push({ message: b.message, level: b.level }),
    });
    const messages = seen.map((s) => s.message);
    expect(messages).toContain("whois.endpoint_failed");
  });

  it("emits help + invalid_arg breadcrumbs on early-return", async () => {
    const seen: Array<{ message: string; level: string }> = [];
    const { fetcher } = buildFetcher({});
    await executeOpenclawWhoisCommand({
      rawArgument: "",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      addBreadcrumb: (b) => seen.push({ message: b.message, level: b.level }),
    });
    expect(seen.map((s) => s.message)).toContain("whois.help");

    seen.length = 0;
    await executeOpenclawWhoisCommand({
      rawArgument: "<<bad>>",
      founderUserId: "user-1",
      founderTgUserId: 999,
      fetcher,
      addBreadcrumb: (b) => seen.push({ message: b.message, level: b.level }),
    });
    expect(seen.map((s) => s.message)).toContain("whois.invalid_arg");
  });
});
