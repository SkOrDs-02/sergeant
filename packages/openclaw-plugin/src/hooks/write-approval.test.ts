/**
 * Unit tests for `createWriteApprovalHook` + `renderApprovalSummary`
 * (`before_tool_call` hook factory, Stage 4a).
 *
 * Coverage:
 *   - Returns `undefined` for non-write tools (read-tools pass through).
 *   - Returns `requireApproval` payload for each of the 5 write-tools.
 *   - `severity` is `critical` for pause_workflow + commit_to_strategy_doc.
 *   - `onResolution(allow-once)` POSTs `/write-audit/log` with
 *     `action: "approved"`.
 *   - `onResolution(deny)` posts `action: "rejected"`.
 *   - Missing founderTgUserId → onResolution soft-skips audit POST.
 *   - `renderApprovalSummary` formats each write-tool params correctly
 *     and truncates oversized strings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawHttpClient } from "../http-client.js";
import {
  WRITE_TOOLS,
  createWriteApprovalHook,
  renderApprovalSummary,
} from "./write-approval.js";

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

function makeFetch(): {
  fetchImpl: typeof globalThis.fetch;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
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

describe("WRITE_TOOLS constant", () => {
  it("matches the 5 Stage 3 write-tools exactly", () => {
    expect([...WRITE_TOOLS].sort()).toEqual(
      [
        "commit_to_strategy_doc",
        "create_github_issue",
        "mute_alert",
        "pause_workflow",
        "post_to_topic",
      ].sort(),
    );
  });
});

describe("createWriteApprovalHook — pass-through for read tools", () => {
  it("returns undefined for non-write tool name", async () => {
    const { fetchImpl } = makeFetch();
    const hook = createWriteApprovalHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
    });

    const result = await hook({
      toolName: "read_strategy_docs",
      params: { path: "docs/strategy.md" },
    });

    expect(result).toBeUndefined();
  });
});

describe("createWriteApprovalHook — write-tool approval payload", () => {
  it.each([
    ["create_github_issue", "warning"],
    ["commit_to_strategy_doc", "critical"],
    ["post_to_topic", "warning"],
    ["pause_workflow", "critical"],
    ["mute_alert", "warning"],
  ] as const)(
    "%s returns requireApproval with severity=%s",
    async (toolName, expectedSeverity) => {
      const { fetchImpl } = makeFetch();
      const hook = createWriteApprovalHook({
        http: makeClient(fetchImpl),
        founderUserId: "user_test",
        founderTgUserId: 42,
      });

      const result = await hook({
        toolName,
        params: {
          title: "x",
          path: "docs/y.md",
          topic: "z",
          workflowId: "w",
          issueId: "i",
          message: "m",
          text: "t",
          reason: "r",
        },
        toolCallId: `tc_${toolName}`,
      });

      expect(result?.requireApproval).toBeDefined();
      const ap = result!.requireApproval!;
      expect(ap.title).toContain(toolName);
      expect(ap.description.length).toBeGreaterThan(0);
      expect(ap.severity).toBe(expectedSeverity);
      expect(ap.timeoutMs).toBeGreaterThan(0);
      expect(ap.timeoutBehavior).toBe("deny");
      expect(typeof ap.onResolution).toBe("function");
    },
  );

  it("respects custom timeoutMs from options", async () => {
    const { fetchImpl } = makeFetch();
    const hook = createWriteApprovalHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
      timeoutMs: 1000,
    });

    const result = await hook({
      toolName: "create_github_issue",
      params: { title: "hi" },
    });

    expect(result?.requireApproval?.timeoutMs).toBe(1000);
  });
});

describe("createWriteApprovalHook — onResolution writes audit log", () => {
  it("POSTs action='approved' for allow-once decision", async () => {
    const { fetchImpl, calls } = makeFetch();
    const hook = createWriteApprovalHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
    });

    const result = await hook({
      toolName: "create_github_issue",
      params: { title: "Glitch", body: "fix" },
      toolCallId: "tc_123",
      runId: "run_abc",
    });

    await result!.requireApproval!.onResolution!("allow-once");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/write-audit/log",
    );
    expect(calls[0]!.body).toMatchObject({
      approvalId: "tc_123",
      tool: "create_github_issue",
      founderUserId: "user_test",
      founderTgUserId: 42,
      action: "approved",
      input: { title: "Glitch", body: "fix" },
      metadata: { decision: "allow-once" },
    });
  });

  it("POSTs action='rejected' for deny / timeout / cancelled", async () => {
    for (const decision of ["deny", "timeout", "cancelled"] as const) {
      const { fetchImpl, calls } = makeFetch();
      const hook = createWriteApprovalHook({
        http: makeClient(fetchImpl),
        founderUserId: "user_test",
        founderTgUserId: 42,
      });
      const result = await hook({
        toolName: "mute_alert",
        params: { issueId: "SENT-1" },
        toolCallId: `tc_${decision}`,
      });
      await result!.requireApproval!.onResolution!(decision);
      expect(calls[0]!.body["action"]).toBe("rejected");
      expect(
        (calls[0]!.body["metadata"] as Record<string, unknown>)["decision"],
      ).toBe(decision);
    }
  });

  it("soft-skips audit log when founderTgUserId is missing", async () => {
    const { fetchImpl, calls } = makeFetch();
    const log = vi.fn();
    const hook = createWriteApprovalHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      log,
    });

    const result = await hook({
      toolName: "create_github_issue",
      params: { title: "x" },
      toolCallId: "tc_skip",
    });
    await result!.requireApproval!.onResolution!("allow-once");

    expect(calls).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "sergeant.write_audit.skipped",
      expect.objectContaining({ reason: "no_founder_tg_user_id" }),
    );
  });

  it("synthesises approvalId when toolCallId is missing", async () => {
    const { fetchImpl, calls } = makeFetch();
    const hook = createWriteApprovalHook({
      http: makeClient(fetchImpl),
      founderUserId: "user_test",
      founderTgUserId: 42,
    });

    const result = await hook({
      toolName: "post_to_topic",
      params: { topic: "x", text: "y" },
      runId: "run_xyz",
    });
    await result!.requireApproval!.onResolution!("allow-once");

    expect(calls[0]!.body["approvalId"]).toMatch(/run_xyz-post_to_topic-\d+/);
  });
});

describe("renderApprovalSummary", () => {
  it("formats create_github_issue with repo + title + labels", () => {
    const s = renderApprovalSummary("create_github_issue", {
      repo: "Skords-01/Sergeant",
      title: "Bug: export crashes",
      labels: ["bug", "p1"],
    });
    expect(s).toContain("Skords-01/Sergeant");
    expect(s).toContain("Bug: export crashes");
    expect(s).toContain("labels=[bug, p1]");
  });

  it("formats commit_to_strategy_doc with path + message", () => {
    const s = renderApprovalSummary("commit_to_strategy_doc", {
      repo: "Skords-01/Sergeant",
      path: "docs/strategy/q3.md",
      message: "docs(strategy): focus retention",
    });
    expect(s).toContain("docs/strategy/q3.md");
    expect(s).toContain("focus retention");
  });

  it("formats post_to_topic with topic + text", () => {
    const s = renderApprovalSummary("post_to_topic", {
      topic: "releases",
      text: "Shipped v1.2.3",
    });
    expect(s).toContain("releases");
    expect(s).toContain("Shipped v1.2.3");
  });

  it("formats pause_workflow with workflowId + reason", () => {
    const s = renderApprovalSummary("pause_workflow", {
      workflowId: "wf_42",
      reason: "Noisy retries",
    });
    expect(s).toContain("wf_42");
    expect(s).toContain("Noisy retries");
  });

  it("formats mute_alert with issueId + untilIso", () => {
    const s = renderApprovalSummary("mute_alert", {
      issueId: "SENT-12345",
      untilIso: "2026-05-20T09:00+03:00",
    });
    expect(s).toContain("SENT-12345");
    expect(s).toContain("2026-05-20T09:00+03:00");
  });

  it("truncates oversized fields", () => {
    const huge = "x".repeat(500);
    const s = renderApprovalSummary("create_github_issue", {
      repo: "r",
      title: huge,
      labels: [],
    });
    // Title is truncated to 100 chars (ellipsis included).
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s).toContain("…");
  });
});
