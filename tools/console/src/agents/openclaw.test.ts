import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSystemPromptInline,
  createOpenClawToolExecutor,
  openClawTools,
  selectToneMode,
  writeToolRoute,
} from "./openclaw.js";
import {
  ApprovalStore,
  PendingApprovalsCollector,
} from "../openclaw/approval-store.js";

const { mockAddBreadcrumb } = vi.hoisted(() => ({
  mockAddBreadcrumb: vi.fn(),
}));
vi.mock("../obs/sentry.js", () => ({
  Sentry: { addBreadcrumb: mockAddBreadcrumb },
}));

describe("OpenClaw selectToneMode", () => {
  it("defaults to diplomatic for vague messages", () => {
    expect(selectToneMode("Що думаєш про це?")).toBe("diplomatic");
    expect(selectToneMode("hi")).toBe("diplomatic");
  });

  it("picks direct mode for incident keywords", () => {
    expect(selectToneMode("у нас 5xx у проді")).toBe("direct");
    expect(selectToneMode("CI впав, треба rollback")).toBe("direct");
    expect(selectToneMode("incident у білінгу")).toBe("direct");
    expect(selectToneMode("error у webhook")).toBe("direct");
  });

  it("picks diplomatic for strategy keywords", () => {
    expect(selectToneMode("давай розглянути стратегію OpenClaw")).toBe(
      "diplomatic",
    );
    expect(selectToneMode("які варіанти є для нашого OKR?")).toBe("diplomatic");
    expect(selectToneMode("vision for product Q3")).toBe("diplomatic");
  });

  it("prefers direct over diplomatic when both keywords present", () => {
    // Real-world: "стратегія по реакції на інцидент" — це incident-context.
    expect(selectToneMode("стратегія по incident response")).toBe("direct");
  });

  it("is case-insensitive", () => {
    expect(selectToneMode("INCIDENT")).toBe("direct");
    expect(selectToneMode("STRATEGY")).toBe("diplomatic");
  });
});

describe("OpenClaw buildSystemPromptInline", () => {
  it("includes namespace + allowlist directives", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@sergeant",
      trigger: "dm",
    });
    expect(p).toContain("source='cofounder'");
    expect(p).toContain("routine_entries");
    expect(p).toContain("mono_transaction");
    expect(p).toContain("ai_memories"); // listed under forbidden examples
    expect(p).toContain("docs/strategy/");
    expect(p).toContain("docs/decisions/");
  });

  it("names OpenClaw timestamp columns explicitly for query_app_db", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@sergeant",
      trigger: "dm",
    });
    expect(p).toContain("openclaw_invocations.invoked_at");
    expect(p).toContain("openclaw_decisions.decided_at");
    expect(p).toContain("openclaw_write_audit.recorded_at");
    expect(p).not.toContain("created_at");
  });

  it("query_app_db tool description repeats the timestamp guidance", () => {
    const tool = openClawTools.find((t) => t.name === "query_app_db");
    expect(tool?.description).toContain("invoked_at");
    expect(tool?.description).toContain("decided_at");
    expect(tool?.description).toContain("recorded_at");
    expect(tool?.description).not.toContain("created_at");
  });

  it("interpolates max-iter cap", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 12,
      founderHandle: "@x",
      trigger: "dm",
    });
    expect(p).toContain("12 Plan→Act→Reflect");
  });

  it("uses different body for direct vs diplomatic", () => {
    const direct = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
    });
    const diplomatic = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
    });
    expect(direct).toContain("ops-mode");
    expect(direct).toContain("Cut to the chase");
    expect(diplomatic).toContain("Diplomatic, exploratory");
    expect(direct).not.toContain("Diplomatic, exploratory");
  });

  it("emits founder + trigger + tone metadata at the end", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@dmytro",
      trigger: "morning_ritual",
    });
    expect(p).toContain("FOUNDER: @dmytro");
    expect(p).toContain("TRIGGER: morning_ritual");
    expect(p).toContain("TONE_MODE: direct");
  });

  it("defaults to cofounder persona when not specified", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
    });
    expect(p).toContain("PERSONA: cofounder");
    expect(p).toContain("синтез"); // cofounder primer mentions synthesis
  });

  it("ops persona prepends ops primer + ops persona tag", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
      persona: "ops",
    });
    expect(p).toContain("PERSONA: ops");
    expect(p.toLowerCase()).toContain("ops-engineer");
  });

  it("growth persona prepends growth primer + growth persona tag", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
      persona: "growth",
    });
    expect(p).toContain("PERSONA: growth");
    expect(p.toLowerCase()).toContain("growth");
  });

  it("eng persona prepends eng primer + eng persona tag", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
      persona: "eng",
    });
    expect(p).toContain("PERSONA: eng");
    expect(p.toLowerCase()).toContain("engineer");
  });

  it("finance persona prepends finance primer + finance persona tag", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
      persona: "finance",
    });
    expect(p).toContain("PERSONA: finance");
    expect(p.toLowerCase()).toContain("finance");
  });

  it("persona primer is placed BEFORE the tone-mode body so it sets context first", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
      persona: "ops",
    });
    const personaIdx = p.indexOf("PERSONA: ops-engineer");
    const toneBodyIdx = p.indexOf("ops-mode");
    expect(personaIdx).toBeGreaterThanOrEqual(0);
    expect(toneBodyIdx).toBeGreaterThanOrEqual(0);
    expect(personaIdx).toBeLessThan(toneBodyIdx);
  });

  // ADR-0031, Phase 3 (PR-34): strategic-mode skeleton tests.

  it("omits strategic-mode block when strategicMode is null/undefined", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
    });
    expect(p).not.toContain("STRATEGIC_MODE:");
  });

  it("plan-mode injects 4-step planning primer + STRATEGIC_MODE trailer", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "strategic_plan",
      strategicMode: "plan",
    });
    expect(p).toContain("STRATEGIC_MODE: plan");
    expect(p).toContain("GOAL");
    expect(p).toContain("CONTEXT");
    expect(p).toContain("OPTIONS");
    expect(p).toContain("DECISION");
    expect(p).toContain("TRIGGER: strategic_plan");
  });

  it("analyze-mode injects hypothesis-driven primer + STRATEGIC_MODE trailer", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "strategic_analyze",
      strategicMode: "analyze",
    });
    expect(p).toContain("STRATEGIC_MODE: analyze");
    expect(p).toContain("ANOMALY");
    expect(p).toContain("HYPOTHESES");
    expect(p).toContain("EVIDENCE");
    expect(p).toContain("RANKED CONCLUSION");
  });

  it("okr-mode injects OKR review primer + STRATEGIC_MODE trailer", () => {
    const p = buildSystemPromptInline({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "strategic_okr",
      strategicMode: "okr",
    });
    expect(p).toContain("STRATEGIC_MODE: okr");
    expect(p).toContain("ACTIVE OKRs");
    expect(p).toContain("PROGRESS PER KR");
    expect(p).toContain("BOTTLENECKS");
    expect(p).toContain("NEXT ACTIONS");
  });

  it("strategic-mode primer is placed AFTER persona primer but BEFORE tone-mode body", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "strategic_plan",
      persona: "ops",
      strategicMode: "plan",
    });
    const personaIdx = p.indexOf("PERSONA: ops-engineer");
    const modeIdx = p.indexOf("STRATEGIC_MODE: plan");
    const toneBodyIdx = p.indexOf("ops-mode");
    expect(personaIdx).toBeGreaterThanOrEqual(0);
    expect(modeIdx).toBeGreaterThanOrEqual(0);
    expect(toneBodyIdx).toBeGreaterThanOrEqual(0);
    expect(personaIdx).toBeLessThan(modeIdx);
    expect(modeIdx).toBeLessThan(toneBodyIdx);
  });

  it("strategicMode is orthogonal to persona — can combine /eng + plan-mode", () => {
    const p = buildSystemPromptInline({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "strategic_plan",
      persona: "eng",
      strategicMode: "plan",
    });
    expect(p).toContain("PERSONA: eng");
    expect(p).toContain("STRATEGIC_MODE: plan");
    expect(p.toLowerCase()).toContain("engineer");
    expect(p).toContain("GOAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ADR-0036 (Phase 4): write-tool routes + executor interception
// ─────────────────────────────────────────────────────────────────────────

describe("OpenClaw writeToolRoute", () => {
  it("returns the canonical /write/* path for each write-tool", () => {
    expect(writeToolRoute("commit_to_strategy_doc")).toBe(
      "/api/internal/openclaw/write/strategy-doc",
    );
    expect(writeToolRoute("create_github_issue")).toBe(
      "/api/internal/openclaw/write/github-issue",
    );
    expect(writeToolRoute("post_to_topic")).toBe(
      "/api/internal/openclaw/write/post-to-topic",
    );
    expect(writeToolRoute("pause_workflow")).toBe(
      "/api/internal/openclaw/write/pause-workflow",
    );
    expect(writeToolRoute("mute_alert")).toBe(
      "/api/internal/openclaw/write/mute-alert",
    );
  });

  it("returns undefined for read-only tools (callback handler must never reach them)", () => {
    for (const name of [
      "recall_memory",
      "get_stripe_metrics",
      "read_strategy_docs",
      "definitely_not_a_tool",
    ]) {
      expect(writeToolRoute(name)).toBeUndefined();
    }
  });
});

describe("OpenClaw executor — write-tool interception (ADR-0036)", () => {
  function makeDeps(
    overrides: {
      approvalStore?: ApprovalStore;
      pendingCollector?: PendingApprovalsCollector;
    } = {},
  ) {
    return {
      serverUrl: "http://internal-not-reachable.invalid",
      internalApiKey: "test-key",
      founderUserId: "user_1",
      founderTgUserId: 555,
      invocationId: 42,
      ...overrides,
    };
  }

  it("write-tool call queues an approval record without HTTP fetch", async () => {
    const approvalStore = new ApprovalStore({
      ttlMs: 600_000,
      idGen: () => "abc12345",
    });
    const pendingCollector = new PendingApprovalsCollector();

    // Sentinel that fails the test if executor ever calls fetch on a write-tool.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("executor must NOT fetch when intercepting a write-tool");
    }) as typeof fetch;

    try {
      const exec = createOpenClawToolExecutor(
        makeDeps({ approvalStore, pendingCollector }),
      );
      const out = await exec("create_github_issue", {
        title: "WF-15 keeps timing out",
        body: "Hit timeout 4× in 24h.",
        labels: ["ops", "tech-debt"],
      });

      const parsed = JSON.parse(out);
      expect(parsed.status).toBe("queued_for_approval");

      expect(pendingCollector.size()).toBe(1);
      const drained = pendingCollector.drain();
      expect(drained).toHaveLength(1);
      const record = drained[0]!;
      expect(record.tool).toBe("create_github_issue");
      expect(record.input).toEqual({
        title: "WF-15 keeps timing out",
        body: "Hit timeout 4× in 24h.",
        labels: ["ops", "tech-debt"],
      });
      expect(record.founderUserId).toBe("user_1");
      expect(record.founderTgUserId).toBe(555);
      expect(record.invocationId).toBe(42);
      expect(record.status).toBe("pending");
      expect(approvalStore.get(record.id)?.id).toBe(record.id);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fail-closed: executor refuses write-tools without approval-store", async () => {
    // No approvalStore / pendingCollector in deps → write-tool must NOT execute.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("fail-closed branch must NOT fetch");
    }) as typeof fetch;
    try {
      const exec = createOpenClawToolExecutor(makeDeps());
      const out = await exec("pause_workflow", { workflowId: "WF-15" });
      const parsed = JSON.parse(out);
      expect(parsed.status).toBe("rejected");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fail-closed: missing pendingCollector alone is sufficient to reject", async () => {
    const approvalStore = new ApprovalStore({ ttlMs: 60_000 });
    const exec = createOpenClawToolExecutor(makeDeps({ approvalStore }));
    const out = await exec("mute_alert", { issueId: "abc" });
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe("rejected");
  });

  it("input is shallow-cloned so subsequent caller mutation cannot rewrite a queued record", async () => {
    const approvalStore = new ApprovalStore({ ttlMs: 60_000 });
    const pendingCollector = new PendingApprovalsCollector();
    const exec = createOpenClawToolExecutor(
      makeDeps({ approvalStore, pendingCollector }),
    );
    const original: Record<string, unknown> = {
      path: "docs/strategy/q3.md",
      body: "## Plan",
    };
    await exec("commit_to_strategy_doc", original);
    // Caller mutates the input object after the call — must not affect record.
    original["body"] = "TAMPERED";
    const drained = pendingCollector.drain();
    expect((drained[0]!.input as { body: string }).body).toBe("## Plan");
  });

  it("multiple write-tool calls accumulate as separate approvals", async () => {
    const approvalStore = new ApprovalStore({
      ttlMs: 60_000,
      idGen: (() => {
        let i = 0;
        return () => `id-${++i}`;
      })(),
    });
    const pendingCollector = new PendingApprovalsCollector();
    const exec = createOpenClawToolExecutor(
      makeDeps({ approvalStore, pendingCollector }),
    );
    await exec("post_to_topic", { alias: "ops", text: "first" });
    await exec("post_to_topic", { alias: "ops", text: "second" });
    expect(pendingCollector.size()).toBe(2);
    const drained = pendingCollector.drain();
    expect(drained.map((r) => r.id)).toEqual(["id-1", "id-2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// O2: Sentry breadcrumbs in tool-calls
// ─────────────────────────────────────────────────────────────────────────

describe("OpenClaw executor — Sentry breadcrumbs (O2)", () => {
  beforeEach(() => {
    mockAddBreadcrumb.mockClear();
  });

  function makeDeps(
    overrides: {
      approvalStore?: ApprovalStore;
      pendingCollector?: PendingApprovalsCollector;
    } = {},
  ) {
    return {
      serverUrl: "http://localhost:9999",
      internalApiKey: "test-key",
      founderUserId: "user_1",
      founderTgUserId: 555,
      invocationId: 42,
      ...overrides,
    };
  }

  it("emits breadcrumb with tool_name, latency_ms, status=ok on successful HTTP call", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"rows":[]}'),
    }) as unknown as typeof fetch;

    try {
      const exec = createOpenClawToolExecutor(makeDeps());
      await exec("query_app_db", { sql: "SELECT 1" });

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      const bc = mockAddBreadcrumb.mock.calls[0]![0];
      expect(bc.category).toBe("openclaw.tool_call");
      expect(bc.level).toBe("info");
      expect(bc.data).toMatchObject({
        tool_name: "query_app_db",
        status: "ok",
      });
      expect(typeof bc.data["latency_ms"]).toBe("number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("emits breadcrumb with status=http_error on non-ok HTTP response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    }) as unknown as typeof fetch;

    try {
      const exec = createOpenClawToolExecutor(makeDeps());
      await exec("recall_memory", { query: "test" });

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      const bc = mockAddBreadcrumb.mock.calls[0]![0];
      expect(bc.level).toBe("warning");
      expect(bc.data).toMatchObject({
        tool_name: "recall_memory",
        status: "http_error",
        http_status: 403,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("emits breadcrumb with status=error on network failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    try {
      const exec = createOpenClawToolExecutor(makeDeps());
      await exec("get_server_stats", {});

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      const bc = mockAddBreadcrumb.mock.calls[0]![0];
      expect(bc.level).toBe("error");
      expect(bc.data).toMatchObject({
        tool_name: "get_server_stats",
        status: "error",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("emits breadcrumb with status=queued for write-tool with approval store", async () => {
    const approvalStore = new ApprovalStore({ ttlMs: 60_000 });
    const pendingCollector = new PendingApprovalsCollector();
    const exec = createOpenClawToolExecutor(
      makeDeps({ approvalStore, pendingCollector }),
    );
    await exec("create_github_issue", { title: "test", body: "test body" });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const bc = mockAddBreadcrumb.mock.calls[0]![0];
    expect(bc.data).toMatchObject({
      tool_name: "create_github_issue",
      status: "queued",
    });
  });

  it("emits breadcrumb with status=rejected for write-tool without approval store", async () => {
    const exec = createOpenClawToolExecutor(makeDeps());
    await exec("pause_workflow", { workflowId: "WF-15" });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const bc = mockAddBreadcrumb.mock.calls[0]![0];
    expect(bc.level).toBe("warning");
    expect(bc.data).toMatchObject({
      tool_name: "pause_workflow",
      status: "rejected",
    });
  });

  it("emits breadcrumb with status=unknown for unrecognized tool", async () => {
    const exec = createOpenClawToolExecutor(makeDeps());
    await exec("nonexistent_tool", {});

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const bc = mockAddBreadcrumb.mock.calls[0]![0];
    expect(bc.level).toBe("error");
    expect(bc.data).toMatchObject({
      tool_name: "nonexistent_tool",
      status: "unknown",
    });
  });
});
