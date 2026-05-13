import { describe, expect, it, vi } from "vitest";
import {
  executeRitualCommand,
  type RitualBreadcrumbFn,
  type RitualFetcher,
} from "./ritual-runner.js";

interface FakeFetcherOptions {
  briefingOk?: boolean;
  briefingStatus?: number;
  briefingMarkdown?: string | null;
  openOk?: boolean;
  openInvocationId?: number | null;
  finalizeOk?: boolean;
}

function makeFetcher(opts: FakeFetcherOptions = {}): RitualFetcher & {
  calls: {
    open: Parameters<RitualFetcher["openInvocation"]>[0][];
    finalize: Parameters<RitualFetcher["finalizeInvocation"]>[0][];
    morning: number;
  };
} {
  const calls = {
    open: [] as Parameters<RitualFetcher["openInvocation"]>[0][],
    finalize: [] as Parameters<RitualFetcher["finalizeInvocation"]>[0][],
    morning: 0,
  };
  const fetcher: RitualFetcher = {
    async postMorningBriefing() {
      calls.morning += 1;
      const ok = opts.briefingOk !== false;
      const status = opts.briefingStatus ?? (ok ? 200 : 500);
      const markdown = opts.briefingMarkdown ?? "# Briefing\n\nMRR: $5k";
      return {
        ok,
        status,
        data: ok ? { markdown, data: { stripe: { mrr: 5_000 } } } : null,
      };
    },
    async openInvocation(input) {
      calls.open.push(input);
      const ok = opts.openOk !== false;
      return {
        ok,
        status: ok ? 200 : 500,
        invocationId:
          opts.openInvocationId === undefined ? 42 : opts.openInvocationId,
      };
    },
    async finalizeInvocation(input) {
      calls.finalize.push(input);
      const ok = opts.finalizeOk !== false;
      return { ok, status: ok ? 200 : 500 };
    },
  };
  return Object.assign(fetcher, { calls });
}

const FOUNDER = {
  founderUserId: "user-abc",
  founderTgUserId: 123_456_789,
  telegramChatId: 100_001,
};

describe("executeRitualCommand — help / unknown", () => {
  it("returns RITUAL_HELP_TEXT for /ritual help, with no audit row + no fetch", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<RitualBreadcrumbFn>[0][] = [];
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "help",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.subcommand).toBe("help");
    expect(result.ok).toBe(true);
    expect(result.invocationId).toBeNull();
    expect(result.reply).toContain("/ritual morning");
    expect(fetcher.calls.open).toHaveLength(0);
    expect(fetcher.calls.finalize).toHaveLength(0);
    expect(fetcher.calls.morning).toBe(0);
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "openclaw.ritual",
      message: "ritual.help",
      level: "info",
    });
  });

  it("returns help + error for unknown token, no audit row", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<RitualBreadcrumbFn>[0][] = [];
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "daily",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.subcommand).toBe("unknown");
    expect(result.ok).toBe(false);
    expect(result.invocationId).toBeNull();
    expect(result.reply).toContain("Невідомий режим");
    expect(result.reply).toContain("«daily»");
    expect(result.reply).toContain("/ritual help");
    expect(fetcher.calls.open).toHaveLength(0);
    expect(fetcher.calls.morning).toBe(0);
    expect(breadcrumbs[0]).toMatchObject({
      message: "ritual.unknown_mode",
      level: "warning",
    });
  });
});

describe("executeRitualCommand — morning happy path", () => {
  it("opens audit-row, fetches briefing, finalizes success, returns markdown", async () => {
    const fetcher = makeFetcher({
      briefingMarkdown: "# Morning briefing\n\nMRR: $10,123",
    });
    const breadcrumbs: Parameters<RitualBreadcrumbFn>[0][] = [];
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.ok).toBe(true);
    expect(result.subcommand).toBe("morning");
    expect(result.invocationId).toBe(42);
    expect(result.reply).toBe("# Morning briefing\n\nMRR: $10,123");

    // Audit-open with the right trigger + metadata.
    expect(fetcher.calls.open).toHaveLength(1);
    expect(fetcher.calls.open[0]).toEqual({
      founderUserId: "user-abc",
      founderTgUserId: 123_456_789,
      trigger: "morning_ritual",
      userMessage: "/ritual morning",
      metadata: {
        telegramChatId: 100_001,
        slashCommand: "/ritual",
        mode: "morning",
      },
    });

    // Briefing endpoint hit exactly once.
    expect(fetcher.calls.morning).toBe(1);

    // Audit-finalize with success.
    expect(fetcher.calls.finalize).toHaveLength(1);
    expect(fetcher.calls.finalize[0]).toMatchObject({
      invocationId: 42,
      status: "success",
      assistantResponse: "# Morning briefing\n\nMRR: $10,123",
      errorMessage: null,
    });

    // Breadcrumbs: start + success.
    expect(breadcrumbs.map((b) => b.message)).toEqual([
      "ritual.morning.start",
      "ritual.morning.success",
    ]);
  });

  it("treats '/ritual morning' explicit arg identically to bare /ritual", async () => {
    const fetcher = makeFetcher();
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
    });
    expect(result.subcommand).toBe("morning");
    expect(result.ok).toBe(true);
    expect(fetcher.calls.open[0]?.userMessage).toBe("/ritual morning");
  });

  it("falls back to defensive note when server returns empty markdown", async () => {
    const fetcher = makeFetcher({ briefingMarkdown: "" });
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(result.reply).toMatch(/markdown-payload порожній/);
    expect(fetcher.calls.finalize[0]?.status).toBe("success");
  });
});

describe("executeRitualCommand — morning failure modes", () => {
  it("on HTTP 500: audit row finalized with status=error + errorMessage", async () => {
    const fetcher = makeFetcher({ briefingOk: false, briefingStatus: 500 });
    const breadcrumbs: Parameters<RitualBreadcrumbFn>[0][] = [];
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.ok).toBe(false);
    expect(result.subcommand).toBe("morning");
    expect(result.invocationId).toBe(42);
    expect(result.reply).toContain("HTTP 500");
    expect(result.reply).toContain("WF-98");
    expect(fetcher.calls.finalize[0]).toMatchObject({
      invocationId: 42,
      status: "error",
      errorMessage: "briefing HTTP 500",
    });
    expect(breadcrumbs.map((b) => b.message)).toEqual([
      "ritual.morning.start",
      "ritual.morning.endpoint_failed",
    ]);
    expect(breadcrumbs[1]?.level).toBe("error");
  });

  it("on HTTP 429: same audit + failure reply", async () => {
    const fetcher = makeFetcher({ briefingOk: false, briefingStatus: 429 });
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
    });
    expect(result.reply).toContain("HTTP 429");
    expect(fetcher.calls.finalize[0]?.errorMessage).toBe("briefing HTTP 429");
  });

  it("when audit-open returns null invocationId — does NOT finalize, but still fetches briefing", async () => {
    const fetcher = makeFetcher({ openOk: false, openInvocationId: null });
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(result.invocationId).toBeNull();
    expect(fetcher.calls.morning).toBe(1);
    expect(fetcher.calls.finalize).toHaveLength(0);
  });
});

describe("executeRitualCommand — weekly / monthly (not implemented)", () => {
  it.each([
    ["weekly", "weekly_review", "Weekly review"] as const,
    ["monthly", "monthly_okr", "Monthly OKR"] as const,
  ])(
    "/ritual %s: audit-open with trigger=%s + finalize as error + ok=false",
    async (mode, expectedTrigger, label) => {
      const fetcher = makeFetcher();
      const breadcrumbs: Parameters<RitualBreadcrumbFn>[0][] = [];
      const result = await executeRitualCommand({
        ...FOUNDER,
        rawArgument: mode,
        fetcher,
        addBreadcrumb: (b) => breadcrumbs.push(b),
      });
      expect(result.ok).toBe(false);
      expect(result.subcommand).toBe(mode);
      expect(result.invocationId).toBe(42);
      expect(result.reply).toContain(label);
      expect(result.reply).toContain("ще не зашиплено");
      expect(result.reply).toContain("O3");

      // Audit-open captures the proper trigger.
      expect(fetcher.calls.open[0]?.trigger).toBe(expectedTrigger);
      expect(fetcher.calls.open[0]?.metadata?.["mode"]).toBe(mode);

      // Briefing endpoint NEVER hit for weekly/monthly.
      expect(fetcher.calls.morning).toBe(0);

      // Audit-finalize with errorMessage=ritual_not_implemented.
      expect(fetcher.calls.finalize[0]).toMatchObject({
        invocationId: 42,
        status: "error",
        errorMessage: "ritual_not_implemented",
      });

      expect(breadcrumbs.map((b) => b.message)).toEqual([
        `ritual.${mode}.start`,
        `ritual.${mode}.not_implemented`,
      ]);
      expect(breadcrumbs[1]?.level).toBe("warning");
    },
  );
});

describe("executeRitualCommand — breadcrumb-sink defaults", () => {
  it("works without addBreadcrumb (no-op default)", async () => {
    const fetcher = makeFetcher();
    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(fetcher.calls.morning).toBe(1);
  });

  it("breadcrumb data carries founderTgUserId + chatId for trace correlation", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<RitualBreadcrumbFn>[0][] = [];
    await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(breadcrumbs[0]?.data).toMatchObject({
      mode: "morning",
      trigger: "morning_ritual",
      founderTgUserId: 123_456_789,
      telegramChatId: 100_001,
    });
  });
});

describe("executeRitualCommand — telegramChatId optionality", () => {
  it("renders metadata.telegramChatId as null when absent", async () => {
    const fetcher = makeFetcher();
    const { telegramChatId: _ignored, ...withoutChat } = FOUNDER;
    void _ignored;
    const result = await executeRitualCommand({
      ...withoutChat,
      rawArgument: "morning",
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(fetcher.calls.open[0]?.metadata?.["telegramChatId"]).toBeNull();
  });
});

describe("executeRitualCommand — defensive ordering", () => {
  it("does NOT call finalize before the briefing endpoint resolves", async () => {
    const order: string[] = [];
    const fetcher: RitualFetcher = {
      async openInvocation() {
        order.push("open");
        return { ok: true, status: 200, invocationId: 42 };
      },
      async postMorningBriefing() {
        order.push("morning");
        return {
          ok: true,
          status: 200,
          data: { markdown: "# ok", data: {} },
        };
      },
      async finalizeInvocation() {
        order.push("finalize");
        return { ok: true, status: 200 };
      },
    };
    await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "morning",
      fetcher,
    });
    expect(order).toEqual(["open", "morning", "finalize"]);
  });
});

describe("executeRitualCommand — happy-path inline replication via vi.fn", () => {
  it("composes correctly when fetcher is built from mocks", async () => {
    const postMorningBriefing = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { markdown: "# ok\n", data: {} },
    });
    const openInvocation = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      invocationId: 7,
    });
    const finalizeInvocation = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200 });

    const result = await executeRitualCommand({
      ...FOUNDER,
      rawArgument: "",
      fetcher: { postMorningBriefing, openInvocation, finalizeInvocation },
    });
    expect(result.ok).toBe(true);
    expect(postMorningBriefing).toHaveBeenCalledTimes(1);
    expect(openInvocation).toHaveBeenCalledTimes(1);
    expect(finalizeInvocation).toHaveBeenCalledTimes(1);
  });
});
