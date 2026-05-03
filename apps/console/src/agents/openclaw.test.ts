import { describe, expect, it } from "vitest";
import {
  buildSystemPromptInline,
  createOpenClawToolExecutor,
  selectToneMode,
  writeToolRoute,
} from "./openclaw.js";
import {
  ApprovalStore,
  PendingApprovalsCollector,
} from "../openclaw/approval-store.js";

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
    expect(p).toContain("subscriptions");
    expect(p).toContain("payments");
    expect(p).toContain("ai_memories"); // listed under forbidden examples
    expect(p).toContain("docs/strategy/");
    expect(p).toContain("docs/decisions/");
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
    original.body = "TAMPERED";
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
