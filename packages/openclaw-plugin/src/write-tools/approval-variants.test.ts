import { describe, it, expect } from "vitest";
import {
  renderApprovalPrompt,
  decodeApprovalCallback,
  buildApprovalKeyboard,
  shouldRunCustomApprovalGate,
  shouldUseNativeRequiresConfirmation,
} from "./approval-variants.js";

describe("renderApprovalPrompt", () => {
  it("includes tool name + each param key with value", () => {
    const text = renderApprovalPrompt("create_github_issue", {
      title: "Fix bug",
      body: "Stack trace: …",
    });
    expect(text).toMatch(/🛠 create_github_issue requested/);
    expect(text).toMatch(/title: Fix bug/);
    expect(text).toMatch(/body: Stack trace/);
    expect(text).toMatch(/Approve or Reject\?/);
  });

  it("truncates very long string values to keep DM readable", () => {
    const longBody = "x".repeat(500);
    const text = renderApprovalPrompt("create_github_issue", {
      body: longBody,
    });
    expect(text).toMatch(/x{200}…/);
    expect(text.length).toBeLessThan(500);
  });

  it("JSON-stringifies non-string param values", () => {
    const text = renderApprovalPrompt("post_to_topic", {
      topicId: 42,
      thread: { id: 1, name: "ops" },
    });
    expect(text).toMatch(/topicId: 42/);
    expect(text).toMatch(/thread: \{"id":1,"name":"ops"\}/);
  });
});

describe("decodeApprovalCallback", () => {
  it("decodes approve and reject verbs", () => {
    expect(decodeApprovalCallback("approve:inv_001")).toEqual({
      status: "approved",
      invocationId: "inv_001",
    });
    expect(decodeApprovalCallback("reject:inv_002")).toEqual({
      status: "rejected",
      invocationId: "inv_002",
    });
  });

  it("returns unknown for malformed payloads", () => {
    expect(decodeApprovalCallback("yes")).toEqual({ status: "unknown" });
    expect(decodeApprovalCallback("foo:bar")).toEqual({ status: "unknown" });
  });

  it("preserves colons inside invocation ids", () => {
    const result = decodeApprovalCallback("approve:inv:001:test");
    expect(result.status).toBe("approved");
    expect(result.invocationId).toBe("inv:001:test");
  });
});

describe("buildApprovalKeyboard", () => {
  it("renders 2-button inline keyboard with invocation-scoped callback data", () => {
    const kb = buildApprovalKeyboard("inv_42");
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0]).toHaveLength(2);
    expect(kb.inline_keyboard[0]?.[0]?.callback_data).toBe("approve:inv_42");
    expect(kb.inline_keyboard[0]?.[1]?.callback_data).toBe("reject:inv_42");
  });
});

describe("approval variant gating predicates", () => {
  it("Variant A — native requiresConfirmation, no custom gate", () => {
    expect(shouldRunCustomApprovalGate("A")).toBe(false);
    expect(shouldUseNativeRequiresConfirmation("A")).toBe(true);
  });

  it("Variant B — custom gate via tool_call_pre, no native flag", () => {
    expect(shouldRunCustomApprovalGate("B")).toBe(true);
    expect(shouldUseNativeRequiresConfirmation("B")).toBe(false);
  });

  it("Variant C — native gate + plugin audit; no custom approval", () => {
    expect(shouldRunCustomApprovalGate("C")).toBe(false);
    expect(shouldUseNativeRequiresConfirmation("C")).toBe(true);
  });
});
