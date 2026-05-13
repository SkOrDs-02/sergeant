import { describe, expect, it, vi } from "vitest";

import {
  executeOpenclawStatusCommand,
  type BudgetResponse,
  type InvocationsListResponse,
  type N8nListResponse,
  type SentryIssuesResponse,
  type StatusFetcher,
} from "./status-runner.js";

// ─────────────────────────────────────────────────────────────────────────
// Helpers: build a fully-functional StatusFetcher mock
// ─────────────────────────────────────────────────────────────────────────

interface FakeFetcherOverrides {
  invocations?: InvocationsListResponse;
  invocationsStatus?: number;
  invocationsOk?: boolean;
  workflows?: N8nListResponse;
  workflowsStatus?: number;
  workflowsOk?: boolean;
  budget?: BudgetResponse;
  budgetStatus?: number;
  budgetOk?: boolean;
  sentry?: SentryIssuesResponse;
  sentryStatus?: number;
  sentryOk?: boolean;
  openInvocationId?: number | null;
  openInvocationOk?: boolean;
  finalizeOk?: boolean;
}

function buildFetcher(overrides: FakeFetcherOverrides = {}): {
  fetcher: StatusFetcher;
  calls: {
    listInvocations: ReturnType<typeof vi.fn>;
    listN8nWorkflows: ReturnType<typeof vi.fn>;
    getBudget: ReturnType<typeof vi.fn>;
    getSentryIssues: ReturnType<typeof vi.fn>;
    openInvocation: ReturnType<typeof vi.fn>;
    finalizeInvocation: ReturnType<typeof vi.fn>;
  };
} {
  const listInvocations = vi.fn(async () => ({
    ok: overrides.invocationsOk ?? true,
    status: overrides.invocationsStatus ?? 200,
    data:
      overrides.invocations ?? ({ invocations: [] } as InvocationsListResponse),
  }));
  const listN8nWorkflows = vi.fn(async () => ({
    ok: overrides.workflowsOk ?? true,
    status: overrides.workflowsStatus ?? 200,
    data: overrides.workflows ?? ({ workflows: [] } as N8nListResponse),
  }));
  const getBudget = vi.fn(async () => ({
    ok: overrides.budgetOk ?? true,
    status: overrides.budgetStatus ?? 200,
    data:
      overrides.budget ??
      ({
        allowed: true,
        spentUsd: 0.12,
        budgetUsd: 5,
        remainingUsd: 4.88,
      } as BudgetResponse),
  }));
  const getSentryIssues = vi.fn(async () => ({
    ok: overrides.sentryOk ?? true,
    status: overrides.sentryStatus ?? 200,
    data: overrides.sentry ?? ({ issues: [] } as SentryIssuesResponse),
  }));
  const openInvocation = vi.fn(async () => ({
    ok: overrides.openInvocationOk ?? true,
    status: 200,
    invocationId:
      overrides.openInvocationId !== undefined
        ? overrides.openInvocationId
        : 42,
  }));
  const finalizeInvocation = vi.fn(async () => ({
    ok: overrides.finalizeOk ?? true,
    status: 200,
  }));
  return {
    fetcher: {
      listInvocations,
      listN8nWorkflows,
      getBudget,
      getSentryIssues,
      openInvocation,
      finalizeInvocation,
    },
    calls: {
      listInvocations,
      listN8nWorkflows,
      getBudget,
      getSentryIssues,
      openInvocation,
      finalizeInvocation,
    },
  };
}

const NOW = new Date("2026-05-13T12:00:00Z");

function baseDeps(
  overrides: Partial<Parameters<typeof executeOpenclawStatusCommand>[0]> = {},
) {
  const { fetcher } = buildFetcher();
  return {
    rawArgument: "",
    founderUserId: "founder-1",
    founderTgUserId: 12345,
    telegramChatId: 67890,
    fetcher,
    now: () => NOW,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// help + unknown subcommands
// ─────────────────────────────────────────────────────────────────────────

describe("executeOpenclawStatusCommand — help/unknown", () => {
  it("returns OPENCLAW_HELP_TEXT for /openclaw help without audit", async () => {
    const { fetcher, calls } = buildFetcher();
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "help",
      fetcher,
    });
    expect(result.subcommand).toBe("help");
    expect(result.invocationId).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("/openclaw status");
    expect(calls.openInvocation).not.toHaveBeenCalled();
    expect(calls.finalizeInvocation).not.toHaveBeenCalled();
    expect(calls.listInvocations).not.toHaveBeenCalled();
  });

  it("emits Sentry breadcrumb for /openclaw help", async () => {
    const breadcrumbs: Array<Record<string, unknown>> = [];
    await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "help",
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "openclaw.status",
      message: "openclaw.help",
      level: "info",
    });
  });

  it("returns unknown-subcommand reply + help-text without audit", async () => {
    const { fetcher, calls } = buildFetcher();
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "debug",
      fetcher,
    });
    expect(result.subcommand).toBe("unknown");
    expect(result.invocationId).toBeNull();
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("Невідома підкоманда");
    expect(result.reply).toContain("«debug»");
    expect(result.reply).toContain("/openclaw status"); // help block appended
    expect(calls.openInvocation).not.toHaveBeenCalled();
  });

  it("emits warning Sentry breadcrumb for unknown subcommand", async () => {
    const breadcrumbs: Array<Record<string, unknown>> = [];
    await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "xyz",
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "openclaw.status",
      message: "openclaw.unknown_subcommand",
      level: "warning",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// status — happy path
// ─────────────────────────────────────────────────────────────────────────

describe("executeOpenclawStatusCommand — status happy path", () => {
  it("opens audit-row with trigger=dm + slashCommand metadata", async () => {
    const { fetcher, calls } = buildFetcher();
    await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(calls.openInvocation).toHaveBeenCalledTimes(1);
    expect(calls.openInvocation).toHaveBeenCalledWith({
      founderUserId: "founder-1",
      founderTgUserId: 12345,
      trigger: "dm",
      userMessage: "/openclaw status",
      metadata: {
        telegramChatId: 67890,
        slashCommand: "/openclaw",
        subcommand: "status",
      },
    });
  });

  it("defaults to status when rawArgument is empty", async () => {
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "",
    });
    expect(result.subcommand).toBe("status");
    expect(result.ok).toBe(true);
  });

  it("fans out all 4 data fetches in parallel", async () => {
    const { fetcher, calls } = buildFetcher();
    await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(calls.listInvocations).toHaveBeenCalledTimes(1);
    expect(calls.listN8nWorkflows).toHaveBeenCalledTimes(1);
    expect(calls.getBudget).toHaveBeenCalledTimes(1);
    expect(calls.getSentryIssues).toHaveBeenCalledTimes(1);
  });

  it("renders rendered snapshot with persona + budget + workflows + invocations + sentry", async () => {
    const { fetcher } = buildFetcher({
      invocations: {
        invocations: [
          {
            id: 1,
            invoked_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
            trigger: "morning_ritual",
            user_message: "/ritual",
            status: "success",
            cost_usd: 0.0234,
            duration_ms: 1500,
            iterations: 3,
            tone_mode: null,
          },
        ],
      },
      workflows: {
        workflows: [
          {
            id: "WF-25",
            name: "Morning briefing",
            active: true,
            tier: "A",
            category: "ritual",
            updatedAt: NOW.toISOString(),
          },
        ],
      },
      budget: {
        allowed: true,
        spentUsd: 0.55,
        budgetUsd: 5,
        remainingUsd: 4.45,
      },
      sentry: {
        issues: [
          {
            title: "AnthropicTimeout",
            level: "error",
            count: "7",
            permalink: "https://sentry.io/x",
          },
        ],
      },
    });
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(result.subcommand).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("<b>🦅 OpenClaw status</b>");
    expect(result.reply).toContain("<code>cofounder</code>");
    expect(result.reply).toContain("$0.5500 / $5.00");
    expect(result.reply).toContain("<code>WF-25</code>");
    expect(result.reply).toContain("morning_ritual");
    expect(result.reply).toContain("AnthropicTimeout");
  });

  it("finalizes audit-row with success after rendering", async () => {
    const { fetcher, calls } = buildFetcher();
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(calls.finalizeInvocation).toHaveBeenCalledTimes(1);
    expect(calls.finalizeInvocation).toHaveBeenCalledWith({
      invocationId: 42,
      status: "success",
      assistantResponse: result.reply,
      errorMessage: null,
    });
  });

  it("skips finalize when openInvocation returned null invocationId", async () => {
    const { fetcher, calls } = buildFetcher({ openInvocationId: null });
    await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(calls.finalizeInvocation).not.toHaveBeenCalled();
  });

  it("emits openclaw.status.start + openclaw.status.success breadcrumbs", async () => {
    const breadcrumbs: Array<Record<string, unknown>> = [];
    await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });
    expect(breadcrumbs.map((b) => b["message"])).toEqual([
      "openclaw.status.start",
      "openclaw.status.success",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// status — fail-soft per data source
// ─────────────────────────────────────────────────────────────────────────

describe("executeOpenclawStatusCommand — fail-soft per source", () => {
  it("renders snapshot when invocations fetch returned HTTP 500", async () => {
    const { fetcher } = buildFetcher({
      invocationsOk: false,
      invocationsStatus: 500,
    });
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("недоступно");
    expect(result.reply).toContain("HTTP 500");
  });

  it("renders not-configured hint when n8n returned notConfigured", async () => {
    const { fetcher } = buildFetcher({
      workflows: { workflows: [], notConfigured: true },
    });
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(result.reply).toContain("n8n credentials not configured");
  });

  it("renders Sentry not-configured hint", async () => {
    const { fetcher } = buildFetcher({
      sentry: { notConfigured: true, note: "no token" },
    });
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(result.reply).toContain("Sentry not configured");
  });

  it("renders budget недоступно when budget fetch fails", async () => {
    const { fetcher } = buildFetcher({
      budgetOk: false,
      budgetStatus: 502,
    });
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(result.reply).toContain("Budget");
    expect(result.reply).toContain("HTTP 502");
  });

  it("still finalizes audit-row even when individual sources fail", async () => {
    const { fetcher, calls } = buildFetcher({
      invocationsOk: false,
      invocationsStatus: 500,
      workflowsOk: false,
      workflowsStatus: 503,
      budgetOk: false,
      sentryOk: false,
    });
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(calls.finalizeInvocation).toHaveBeenCalledTimes(1);
    expect(calls.finalizeInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        errorMessage: null,
      }),
    );
  });

  it("does not crash when addBreadcrumb is undefined", async () => {
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
    });
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// snapshot shape — persona inclusion
// ─────────────────────────────────────────────────────────────────────────

describe("executeOpenclawStatusCommand — persona snapshot", () => {
  it("includes all 5 personas including cofounder in rendered text", async () => {
    const result = await executeOpenclawStatusCommand({
      ...baseDeps(),
      rawArgument: "status",
    });
    expect(result.reply).toContain("cofounder");
    expect(result.reply).toContain("ops");
    expect(result.reply).toContain("growth");
    expect(result.reply).toContain("eng");
    expect(result.reply).toContain("finance");
  });
});
