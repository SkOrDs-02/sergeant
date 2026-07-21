/**
 * SYSTEM_PREFIX is generated from the assistant capability registry. These
 * tests lock in the contract between the registry and the prompt:
 *
 *   1. Prompt shape is preserved (Anthropic prompt-cache key sensitivity —
 *      any drift requires a deliberate `SYSTEM_PROMPT_VERSION` bump).
 *   2. Every non-prompt-only capability appears in the prompt.
 *   3. Every server tool actually wired into `TOOLS` has a matching registry
 *      entry (no "ghost" tools the user can never discover).
 *   4. Token budget guard (≤10% growth vs. baseline) — handoff requirement.
 */
import { describe, it, expect, vi } from "vitest";
import {
  ASSISTANT_CAPABILITIES,
  getCapabilityServerTool,
} from "@sergeant/shared";
import {
  SYSTEM_PREFIX,
  SYSTEM_PROMPT_VERSION,
  buildModuleToolList,
  buildSystemPrompt,
} from "./systemPrompt.js";
import { TOOLS } from "../tools.js";

describe("SYSTEM_PREFIX — registry-driven", () => {
  it("starts with the canonical assistant intro (cache key sensitivity)", () => {
    expect(SYSTEM_PREFIX).toMatch(/^Ти персональний асистент/);
  });

  it("ends with the ДАНІ marker so the per-user context block can append cleanly", () => {
    expect(SYSTEM_PREFIX.endsWith("ДАНІ:\n")).toBe(true);
  });

  it("buildSystemPrompt() is deterministic", () => {
    expect(buildSystemPrompt()).toBe(SYSTEM_PREFIX);
    expect(buildSystemPrompt()).toBe(buildSystemPrompt());
  });

  it("exposes a non-empty SYSTEM_PROMPT_VERSION marker", () => {
    expect(SYSTEM_PROMPT_VERSION).toMatch(/^v\d+/);
  });

  it("every non-prompt-only capability appears in the prompt", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      const tool = getCapabilityServerTool(c);
      if (!tool) continue;
      expect(SYSTEM_PREFIX, `${c.id} (${tool})`).toContain(tool);
    }
  });

  it("prompt-only capabilities are NOT listed as tools", () => {
    const promptOnly = ASSISTANT_CAPABILITIES.filter(
      (c) => c.serverTool === null,
    );
    expect(promptOnly.length).toBeGreaterThan(0); // sanity
    const toolList = buildModuleToolList();
    for (const c of promptOnly) {
      // The id may legitimately appear elsewhere as plain text — but it must
      // not appear in the comma-delimited tool list bullets.
      const inList = toolList.split(/\n/).some((line) => line.includes(c.id));
      expect(inList, `${c.id} (prompt-only) leaked into tool list`).toBe(false);
    }
  });

  it("every server tool in TOOLS has a matching registry entry", () => {
    const registryToolNames = new Set(
      ASSISTANT_CAPABILITIES.map(getCapabilityServerTool).filter(
        (t): t is string => t !== null,
      ),
    );
    for (const t of TOOLS) {
      expect(
        registryToolNames.has(t.name),
        `tool ${t.name} exists in TOOLS but has no AssistantCapability — add it to assistantCatalogue.ts`,
      ).toBe(true);
    }
  });

  it("registry server-tool names are unique (no duplicate mappings)", () => {
    const seen = new Set<string>();
    for (const c of ASSISTANT_CAPABILITIES) {
      const t = getCapabilityServerTool(c);
      if (!t) continue;
      expect(seen.has(t), `duplicate serverTool: ${t}`).toBe(false);
      seen.add(t);
    }
  });

  it("aiHints are short (≤30 chars) so the prompt stays terse", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      if (c.aiHint == null) continue;
      expect(c.aiHint.length, `${c.id} aiHint too long`).toBeLessThanOrEqual(
        30,
      );
      expect(c.aiHint.trim()).toBe(c.aiHint);
    }
  });

  // AI-CONTEXT: baseline computed 2026-04-26 from v5 (hand-written) prompt.
  // Approximation: chars / 3.5 ≈ tokens for mixed Cyrillic/ASCII Anthropic
  // tokenizer. Real measurement happens server-side in usage logs.
  // Allow up to 1.10× growth per the PR2 handoff guard.
  it("token budget: stays within 110% of baseline (~1012 tokens)", () => {
    const BASELINE_TOKENS = 1012;
    const BUDGET = Math.round(BASELINE_TOKENS * 1.1);
    const approxTokens = Math.round(SYSTEM_PREFIX.length / 3.5);
    expect(
      approxTokens,
      `prompt grew to ~${approxTokens} tokens (budget ${BUDGET})`,
    ).toBeLessThanOrEqual(BUDGET);
  });

  it("module bullets follow the canonical Ukrainian module labels", () => {
    const list = buildModuleToolList();
    expect(list).toMatch(/- Фінанси: /);
    expect(list).toMatch(/- Фізрук: /);
    expect(list).toMatch(/- Рутина: /);
    expect(list).toMatch(/- Харчування: /);
    expect(list).toMatch(/- Кросмодульні: /);
    expect(list).toMatch(/- Аналітика: /);
    expect(list).toMatch(/- Утиліти: /);
    expect(list).toMatch(/- Пам'ять: /);
  });

  it("skips a module bullet when every capability is prompt-only", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@sergeant/shared")>();
      return {
        ...actual,
        ASSISTANT_CAPABILITIES: actual.ASSISTANT_CAPABILITIES.map(
          (capability) =>
            capability.module === "memory"
              ? { ...capability, serverTool: null }
              : capability,
        ),
      };
    });

    const { buildModuleToolList: buildModuleToolListWithEmptyMemory } =
      await import("./systemPrompt.js");

    const list = buildModuleToolListWithEmptyMemory();
    expect(list).toMatch(/- Фінанси: /);
    expect(list).not.toMatch(/- Пам'ять: /);

    vi.doUnmock("@sergeant/shared");
    vi.resetModules();
  });

  it("aiHints are rendered in parentheses next to the tool name", () => {
    // Spot-check: delete_transaction has aiHint "лише ручні m_<id>"
    expect(SYSTEM_PREFIX).toContain("delete_transaction (лише ручні m_<id>)");
    expect(SYSTEM_PREFIX).toContain("update_budget (ліміт або ціль)");
    expect(SYSTEM_PREFIX).toContain("batch_categorize (dry_run спершу)");
  });

  it("does NOT contain the legacy /help instruction (PR #795 redirected it)", () => {
    expect(SYSTEM_PREFIX).not.toContain("/help");
    expect(SYSTEM_PREFIX).not.toContain("/допомога");
  });

  // Snapshot: locks the exact prompt text. Updating this requires bumping
  // SYSTEM_PROMPT_VERSION and is a deliberate, reviewed change.
  it("matches the canonical snapshot", () => {
    expect(SYSTEM_PREFIX).toMatchSnapshot();
  });
});
