import { describe, expect, it } from "vitest";
import {
  executeMuteCommand,
  type MuteBreadcrumbFn,
  type MuteFetcher,
} from "./mute-runner.js";

interface FakeFetcherOptions {
  openOk?: boolean;
  openInvocationId?: number | null;
  finalizeOk?: boolean;
  setOk?: boolean;
  setStatus?: number;
  clearOk?: boolean;
  clearStatus?: number;
  statusOk?: boolean;
  statusStatus?: number;
  statusState?: {
    founderUserId: string;
    mutedUntilIso: string | null;
    setAtIso: string;
    reason: string | null;
  } | null;
}

function makeFetcher(opts: FakeFetcherOptions = {}): MuteFetcher & {
  calls: {
    open: Parameters<MuteFetcher["openInvocation"]>[0][];
    finalize: Parameters<MuteFetcher["finalizeInvocation"]>[0][];
    set: Parameters<MuteFetcher["postMuteSet"]>[0][];
    clear: Parameters<MuteFetcher["postMuteClear"]>[0][];
    status: Parameters<MuteFetcher["postMuteStatus"]>[0][];
  };
} {
  const calls = {
    open: [] as Parameters<MuteFetcher["openInvocation"]>[0][],
    finalize: [] as Parameters<MuteFetcher["finalizeInvocation"]>[0][],
    set: [] as Parameters<MuteFetcher["postMuteSet"]>[0][],
    clear: [] as Parameters<MuteFetcher["postMuteClear"]>[0][],
    status: [] as Parameters<MuteFetcher["postMuteStatus"]>[0][],
  };
  const fetcher: MuteFetcher = {
    async postMuteSet(input) {
      calls.set.push(input);
      const ok = opts.setOk !== false;
      return {
        ok,
        status: opts.setStatus ?? (ok ? 200 : 500),
        data: ok
          ? {
              founderUserId: input.founderUserId,
              mutedUntilIso: input.mutedUntilIso,
              setAtIso: "2026-05-13T18:00:00.000Z",
              reason: input.reason,
            }
          : null,
      };
    },
    async postMuteClear(input) {
      calls.clear.push(input);
      const ok = opts.clearOk !== false;
      return {
        ok,
        status: opts.clearStatus ?? (ok ? 200 : 500),
        data: ok
          ? {
              founderUserId: input.founderUserId,
              mutedUntilIso: null,
              setAtIso: "2026-05-13T18:00:00.000Z",
              reason: null,
            }
          : null,
      };
    },
    async postMuteStatus(input) {
      calls.status.push(input);
      const ok = opts.statusOk !== false;
      return {
        ok,
        status: opts.statusStatus ?? (ok ? 200 : 500),
        data: ok ? { state: opts.statusState ?? null } : null,
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

describe("executeMuteCommand — help (no audit, no fetcher call)", () => {
  it("/mute help → renders MUTE_HELP_TEXT, no audit row, info breadcrumb", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<MuteBreadcrumbFn>[0][] = [];
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "help",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.subcommand).toBe("help");
    expect(result.ok).toBe(true);
    expect(result.invocationId).toBeNull();
    expect(result.reply).toContain("/mute 1h");
    expect(fetcher.calls.open).toHaveLength(0);
    expect(fetcher.calls.finalize).toHaveLength(0);
    expect(fetcher.calls.set).toHaveLength(0);
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "openclaw.mute",
      message: "mute.help",
      level: "info",
    });
  });

  it("/mute (empty arg) → defaults to help (no audit, no side-effects)", async () => {
    const fetcher = makeFetcher();
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "",
      fetcher,
    });
    expect(result.subcommand).toBe("help");
    expect(result.reply).toContain("/mute help");
    expect(fetcher.calls.open).toHaveLength(0);
  });
});

describe("executeMuteCommand — unknown subcommand", () => {
  it("emits warning breadcrumb + returns help + error, no audit row", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<MuteBreadcrumbFn>[0][] = [];
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "forever",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.subcommand).toBe("unknown");
    expect(result.ok).toBe(false);
    expect(result.invocationId).toBeNull();
    expect(result.reply).toMatch(/forever/);
    expect(result.reply).toContain("/mute 1h");
    expect(fetcher.calls.open).toHaveLength(0);
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]?.level).toBe("warning");
  });
});

describe("executeMuteCommand — duration (happy path)", () => {
  it("/mute 1h → opens invocation, calls postMuteSet з ISO expiry, finalizes success", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<MuteBreadcrumbFn>[0][] = [];
    const now = new Date("2026-05-13T18:00:00.000Z");
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "1h",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
      now,
    });
    expect(result.subcommand).toBe("1h");
    expect(result.ok).toBe(true);
    expect(result.invocationId).toBe(42);

    expect(fetcher.calls.open).toHaveLength(1);
    expect(fetcher.calls.open[0]).toMatchObject({
      founderUserId: "user-abc",
      founderTgUserId: 123_456_789,
      trigger: "dm",
      metadata: expect.objectContaining({
        slashCommand: "/mute",
        subcommand: "1h",
      }),
    });

    expect(fetcher.calls.set).toHaveLength(1);
    expect(fetcher.calls.set[0]?.mutedUntilIso).toBe(
      "2026-05-13T19:00:00.000Z",
    );
    expect(fetcher.calls.set[0]?.reason).toBeNull();

    expect(fetcher.calls.finalize).toHaveLength(1);
    expect(fetcher.calls.finalize[0]).toMatchObject({
      invocationId: 42,
      status: "success",
      errorMessage: null,
    });

    expect(result.reply).toContain("Mute активовано");
    expect(result.reply).toContain("1h");
    // start + success
    expect(breadcrumbs.map((b) => b.message)).toEqual([
      "mute.1h.start",
      "mute.1h.success",
    ]);
  });

  it("/mute until-morning → expiry = next 08:00 Kyiv", async () => {
    const fetcher = makeFetcher();
    const now = new Date("2026-05-13T19:00:00.000Z"); // 22:00 Kyiv DST
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "until-morning",
      fetcher,
      now,
    });
    expect(result.ok).toBe(true);
    expect(fetcher.calls.set[0]?.mutedUntilIso).toBe(
      "2026-05-14T05:00:00.000Z",
    );
  });

  it("/mute 30m → fail-soft on setMute HTTP 503 (audit-error, hint user)", async () => {
    const fetcher = makeFetcher({ setOk: false, setStatus: 503 });
    const breadcrumbs: Parameters<MuteBreadcrumbFn>[0][] = [];
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "30m",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("HTTP 503");
    expect(fetcher.calls.finalize[0]).toMatchObject({
      status: "error",
      errorMessage: expect.stringContaining("HTTP 503"),
    });
    expect(breadcrumbs.map((b) => b.message)).toContain(
      "mute.30m.endpoint_failed",
    );
  });

  it("/mute 30m → skip finalize-call when openInvocation returns null id", async () => {
    const fetcher = makeFetcher({ openInvocationId: null });
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "30m",
      fetcher,
    });
    expect(result.invocationId).toBeNull();
    expect(fetcher.calls.set).toHaveLength(1);
    expect(fetcher.calls.finalize).toHaveLength(0);
    expect(result.ok).toBe(true);
  });
});

describe("executeMuteCommand — off (clear mute)", () => {
  it("/mute off → opens invocation, calls postMuteClear, finalizes success", async () => {
    const fetcher = makeFetcher();
    const breadcrumbs: Parameters<MuteBreadcrumbFn>[0][] = [];
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "off",
      fetcher,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(result.subcommand).toBe("off");
    expect(result.ok).toBe(true);
    expect(fetcher.calls.clear).toHaveLength(1);
    expect(fetcher.calls.clear[0]).toEqual({ founderUserId: "user-abc" });
    expect(fetcher.calls.finalize[0]?.status).toBe("success");
    expect(result.reply).toContain("Mute знято");
    expect(breadcrumbs.map((b) => b.message)).toContain("mute.off.success");
  });

  it("/mute off → fail-soft на HTTP 500", async () => {
    const fetcher = makeFetcher({ clearOk: false, clearStatus: 500 });
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "off",
      fetcher,
    });
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("HTTP 500");
    expect(fetcher.calls.finalize[0]?.status).toBe("error");
  });
});

describe("executeMuteCommand — status (read-only)", () => {
  it("/mute status → no row → renders inactive", async () => {
    const fetcher = makeFetcher({ statusState: null });
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "status",
      fetcher,
    });
    expect(result.subcommand).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("Mute неактивний");
    expect(fetcher.calls.status).toHaveLength(1);
    expect(fetcher.calls.finalize[0]?.status).toBe("success");
  });

  it("/mute status → active row → renders remaining time + reason", async () => {
    const fetcher = makeFetcher({
      statusState: {
        founderUserId: "user-abc",
        mutedUntilIso: "2026-05-13T22:00:00.000Z",
        setAtIso: "2026-05-13T18:00:00.000Z",
        reason: "deep-work",
      },
    });
    const now = new Date("2026-05-13T18:00:00.000Z");
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "status",
      fetcher,
      now,
    });
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("Mute активний");
    expect(result.reply).toContain("4 год");
    expect(result.reply).toContain("deep-work");
  });

  it("/mute status → expired row (muted_until у минулому) → renders inactive", async () => {
    const fetcher = makeFetcher({
      statusState: {
        founderUserId: "user-abc",
        mutedUntilIso: "2026-05-13T17:00:00.000Z",
        setAtIso: "2026-05-13T16:00:00.000Z",
        reason: null,
      },
    });
    const now = new Date("2026-05-13T18:00:00.000Z");
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "status",
      fetcher,
      now,
    });
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("Mute неактивний");
  });

  it("/mute status → fail-soft на HTTP 500", async () => {
    const fetcher = makeFetcher({ statusOk: false, statusStatus: 500 });
    const result = await executeMuteCommand({
      ...FOUNDER,
      rawArgument: "status",
      fetcher,
    });
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("HTTP 500");
    expect(fetcher.calls.finalize[0]?.status).toBe("error");
  });
});
