/**
 * Unit tests for `parseToolCalls` — the client-side tool-call firewall.
 *
 * Covers audit `2026-05-13-consolidated-page-audit.md` C1: a tool call must
 * (1) match the structural envelope, (2) name a tool on the allow-list, and
 * (3) carry a valid input for known mutators. Unknown or malformed tool
 * names must be rejected so a prompt-injected model reply cannot dispatch an
 * arbitrary action with the user's Better Auth cookie context.
 */
import { describe, it, expect } from "vitest";
import { parseToolCalls, KNOWN_TOOL_NAMES } from "./toolCallSchema";

describe("parseToolCalls — name allow-list (C1)", () => {
  it("rejects a structurally-valid call with an unknown tool name", () => {
    const result = parseToolCalls([
      { id: "t1", name: "exfiltrate_cookies", input: {} },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("exfiltrate_cookies"))).toBe(
        true,
      );
      expect(result.issues.some((i) => i.includes("unknown tool"))).toBe(true);
    }
  });

  it("drops the whole batch when any single call is unknown", () => {
    const result = parseToolCalls([
      { id: "t1", name: "log_water", input: { amount_ml: 250 } },
      { id: "t2", name: "rm_rf", input: {} },
    ]);
    expect(result.ok).toBe(false);
  });

  it("accepts a known read-only tool with an arbitrary input shape", () => {
    const result = parseToolCalls([
      { id: "t1", name: "weekly_summary", input: { range: "this_week" } },
    ]);
    expect(result.ok).toBe(true);
  });

  it("accepts a known mutator with a valid input", () => {
    const result = parseToolCalls([
      { id: "t1", name: "create_transaction", input: { amount: 100 } },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a known mutator with an invalid input even though the name is allowed", () => {
    const result = parseToolCalls([
      { id: "t1", name: "create_transaction", input: { wrong: true } },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects entries that fail the structural envelope before name checks", () => {
    const result = parseToolCalls([{ id: "", name: 42, input: null }]);
    expect(result.ok).toBe(false);
  });

  it("exposes a non-empty allow-list", () => {
    expect(KNOWN_TOOL_NAMES.size).toBeGreaterThan(50);
    expect(KNOWN_TOOL_NAMES.has("create_transaction")).toBe(true);
    expect(KNOWN_TOOL_NAMES.has("recall_memory")).toBe(true);
  });
});
