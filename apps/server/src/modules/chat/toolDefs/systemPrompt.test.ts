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

  // AI-CONTEXT: baseline перебазовано 2026-08-05 на факт v17 (~1145 токенів).
  // Approximation: chars / 3.5 ≈ tokens for mixed Cyrillic/ASCII Anthropic
  // tokenizer. Real measurement happens server-side in usage logs.
  //
  // Стара цифра (1012, знята 2026-04-26 з рукописного v5) пережила пʼять
  // свідомих доповнень промпта — межа порад (v13), голос і заборона вигаданих
  // аргументів (v14), звірка чисел (v15), межа скоупу і `<user_data>` (v17) —
  // і на v17 стеля 1113 виявилась нижчою за факт. Гейт, який червоний завжди,
  // інформаційно дорівнює вимкненому, тож baseline перебазовано на факт.
  //
  // Запас звужено 1.10 → 1.05 навмисно: рамка після перебазування має бути
  // ТІСНІШОЮ за попередню, інакше перебазування перетворюється на спосіб
  // тихо купити собі ще 10% зростання. Наступне додавання правила знову
  // впреться в гейт — так і задумано, промпт кешується, але не безкоштовно.
  //
  // Так і сталося: v22 стояв на 1201 при стелі 1202 — один токен запасу.
  // Рядок про справжні українські слова (v23, +27 токенів) впертися в гейт
  // мусив, і це саме та свідома розмова, заради якої гейт існує: правило
  // зʼявилось за фото від тестера («дніорвий челендж»), тобто платимо
  // 27 токенів кешованого префікса за читабельність кожної відповіді.
  // Baseline перебазовано на факт v23 (1228), запас звужено 1.05 → 1.03 —
  // за тим самим принципом, що й попереднього разу.
  it("token budget: stays within 103% of baseline (~1228 tokens)", () => {
    const BASELINE_TOKENS = 1228;
    const BUDGET = Math.round(BASELINE_TOKENS * 1.03);
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
    expect(list).toMatch(/- Памʼять: /);
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
    expect(list).not.toMatch(/- Памʼять: /);

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
