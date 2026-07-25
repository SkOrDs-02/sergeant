import { describe, it, expect } from "vitest";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_ORDER,
  CAPABILITY_MODULE_META,
  getCapabilityServerTool,
  getQuickActionCapabilities,
  groupCapabilitiesByModule,
  isActiveQuickActionModule,
  isIncompletePrompt,
  pickTopQuickActions,
  searchCapabilities,
  sortQuickActionsForModule,
  type AssistantCapability,
  type CapabilityModule,
} from "./assistantCatalogue";

// Mirrors RISKY_TOOLS in apps/web/src/core/lib/hubChatActionCards.ts.
// Hardcoded here because @sergeant/shared cannot depend on app code.
describe("ASSISTANT_CAPABILITIES — invariants", () => {
  it("has unique ids", () => {
    const ids = ASSISTANT_CAPABILITIES.map((c) => c.id);
    const seen = new Set<string>();
    for (const id of ids) {
      expect(seen.has(id), `duplicate id: ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it("uses snake_case ids", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      expect(c.id, c.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("requiresInput=true ⇒ prompt ends with ': '", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      if (c.requiresInput) {
        expect(c.prompt.endsWith(": "), `${c.id}: ${c.prompt}`).toBe(true);
      } else {
        expect(c.prompt.endsWith(": "), `${c.id}: ${c.prompt}`).toBe(false);
        expect(c.prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it("every module has ≥1 entry", () => {
    const modules = new Set(ASSISTANT_CAPABILITIES.map((c) => c.module));
    for (const m of CAPABILITY_MODULE_ORDER) {
      expect(modules.has(m), `module ${m} has no capabilities`).toBe(true);
    }
  });

  it("CAPABILITY_MODULE_META has entry for every module", () => {
    for (const m of CAPABILITY_MODULE_ORDER) {
      expect(CAPABILITY_MODULE_META[m], m).toBeDefined();
      expect(CAPABILITY_MODULE_META[m].title.length).toBeGreaterThan(0);
    }
  });

  // Перевірка «risky ↔ клієнтський набір» переїхала у `toolRisk.test.ts`.
  // Тут вона звіряла каталог із рукописною копією набору, оголошеною
  // просто вище в цьому ж файлі, — і тому лишалась зеленою, поки в
  // продукті жили чотири різні набори. Тепер джерело одне (`toolRisk.ts`),
  // а порівнюються реальні множини.

  it("isQuickAction entries have priority and online flag", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      if (c.isQuickAction) {
        expect(
          typeof c.quickActionPriority,
          `${c.id} isQuickAction without priority`,
        ).toBe("number");
        // Quick actions hit Anthropic, so they always need network.
        expect(c.requiresOnline, `${c.id} quick action must be online`).toBe(
          true,
        );
      }
    }
  });

  it("has a reasonable total count (sanity)", () => {
    // Spec calls for ~60 entries; allow a small drift.
    expect(ASSISTANT_CAPABILITIES.length).toBeGreaterThanOrEqual(50);
    expect(ASSISTANT_CAPABILITIES.length).toBeLessThanOrEqual(80);
  });

  it("each entry has at least one example", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      expect(c.examples.length, `${c.id} has no examples`).toBeGreaterThan(0);
    }
  });

  it("aiHint is short (≤30 chars) and trimmed when present", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      if (c.aiHint == null) continue;
      expect(c.aiHint.length, `${c.id} aiHint too long`).toBeLessThanOrEqual(
        30,
      );
      expect(c.aiHint.trim(), `${c.id} aiHint must be trimmed`).toBe(c.aiHint);
    }
  });

  it("serverTool overrides resolve to a non-empty snake_case string", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      const tool = getCapabilityServerTool(c);
      if (tool === null) continue;
      expect(tool, `${c.id} resolves to empty tool name`).toMatch(
        /^[a-z][a-z0-9_]*$/,
      );
    }
  });
});

describe("getCapabilityServerTool", () => {
  it("returns id when serverTool is undefined", () => {
    const c = ASSISTANT_CAPABILITIES.find((x) => x.id === "create_transaction");
    expect(c).toBeDefined();
    expect(getCapabilityServerTool(c!)).toBe("create_transaction");
  });

  it("returns null for prompt-only entries (serverTool: null)", () => {
    const c = ASSISTANT_CAPABILITIES.find((x) => x.id === "budget_risks");
    expect(c).toBeDefined();
    expect(getCapabilityServerTool(c!)).toBeNull();
  });

  it("at least 3 prompt-only entries exist (budget_risks, daily_summary, missed_this_week)", () => {
    const promptOnly = ASSISTANT_CAPABILITIES.filter(
      (c) => c.serverTool === null,
    ).map((c) => c.id);
    expect(promptOnly).toEqual(
      expect.arrayContaining([
        "budget_risks",
        "daily_summary",
        "missed_this_week",
      ]),
    );
  });
});

describe("getQuickActionCapabilities", () => {
  it("returns only quick actions, sorted by priority asc", () => {
    const qa = getQuickActionCapabilities();
    expect(qa.length).toBeGreaterThan(0);
    expect(qa.every((c) => c.isQuickAction === true)).toBe(true);
    for (let i = 1; i < qa.length; i++) {
      expect(qa[i]!.quickActionPriority ?? 999).toBeGreaterThanOrEqual(
        qa[i - 1]!.quickActionPriority ?? 999,
      );
    }
  });

  it("includes at least one entry per active module bucket", () => {
    const qa = getQuickActionCapabilities();
    const modules = new Set(qa.map((c) => c.module));
    expect(modules.has("finyk")).toBe(true);
    expect(modules.has("fizruk")).toBe(true);
    expect(modules.has("routine")).toBe(true);
    expect(modules.has("nutrition")).toBe(true);
  });
});

describe("isIncompletePrompt", () => {
  it("returns true for prompts ending in ': '", () => {
    expect(isIncompletePrompt("Додай витрату: ")).toBe(true);
    expect(isIncompletePrompt("Додай підхід: ")).toBe(true);
  });

  it("returns false for complete prompts", () => {
    expect(isIncompletePrompt("Що важливого на сьогодні?")).toBe(false);
    expect(isIncompletePrompt("Підсумуй мій день")).toBe(false);
  });

  it("does not confuse mid-sentence colons with the trailing marker", () => {
    expect(isIncompletePrompt("Звіт: загальний по тижню")).toBe(false);
  });

  it("agrees with requiresInput across the registry", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      expect(isIncompletePrompt(c.prompt)).toBe(c.requiresInput);
    }
  });
});

describe("sortQuickActionsForModule", () => {
  const QA = getQuickActionCapabilities();

  it("places the active domain module first, then hub-like, then others", () => {
    const sorted = sortQuickActionsForModule(QA, "fizruk");
    const modules = sorted.map((a) => a.module);
    const fizrukIdx = modules.indexOf("fizruk");
    const lastFizrukIdx = modules.lastIndexOf("fizruk");
    expect(fizrukIdx).toBe(0);
    // Any hub-like module should land after the fizruk block.
    const HUB_LIKE = new Set<CapabilityModule>([
      "cross",
      "analytics",
      "utility",
      "memory",
    ]);
    const firstHubLikeIdx = modules.findIndex((m) => HUB_LIKE.has(m));
    if (firstHubLikeIdx >= 0) {
      expect(firstHubLikeIdx).toBeGreaterThan(lastFizrukIdx);
    }
  });

  it("with null active module starts with a hub-like bucket", () => {
    const sorted = sortQuickActionsForModule(QA, null);
    const HUB_LIKE = new Set<CapabilityModule>([
      "cross",
      "analytics",
      "utility",
      "memory",
    ]);
    expect(sorted[0]).toBeDefined();
    expect(HUB_LIKE.has(sorted[0]!.module)).toBe(true);
  });

  it("orders entries within a module by quickActionPriority asc", () => {
    const sorted = sortQuickActionsForModule(QA, "finyk");
    const finykOnly = sorted.filter((a) => a.module === "finyk");
    for (let i = 1; i < finykOnly.length; i++) {
      const prev = finykOnly[i - 1]!.quickActionPriority ?? 999;
      const curr = finykOnly[i]!.quickActionPriority ?? 999;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("is stable for ties on priority", () => {
    const a: AssistantCapability = {
      id: "x1",
      module: "utility",
      label: "X1",
      icon: "sun",
      description: "x",
      examples: ["x"],
      prompt: "x1",
      requiresInput: false,
      isQuickAction: true,
      quickActionPriority: 1,
      requiresOnline: true,
    };
    const b: AssistantCapability = { ...a, id: "x2", label: "X2" };
    const sorted = sortQuickActionsForModule([a, b], null);
    expect(sorted.map((q) => q.id)).toEqual(["x1", "x2"]);
  });
});

describe("pickTopQuickActions", () => {
  const QA = getQuickActionCapabilities();

  it("limits to the requested count", () => {
    expect(pickTopQuickActions(QA, null, 4)).toHaveLength(4);
  });

  it("default limit is 6", () => {
    expect(pickTopQuickActions(QA, null)).toHaveLength(6);
  });
});

describe("isActiveQuickActionModule", () => {
  it("true only when capability.module matches a domain active module", () => {
    const finyk = ASSISTANT_CAPABILITIES.find((c) => c.module === "finyk")!;
    const cross = ASSISTANT_CAPABILITIES.find((c) => c.module === "cross")!;
    expect(isActiveQuickActionModule(finyk, "finyk")).toBe(true);
    expect(isActiveQuickActionModule(finyk, "fizruk")).toBe(false);
    expect(isActiveQuickActionModule(finyk, null)).toBe(false);
    // Hub-like modules are never highlighted as "active".
    expect(isActiveQuickActionModule(cross, "finyk")).toBe(false);
  });
});

describe("groupCapabilitiesByModule", () => {
  it("preserves module order from CAPABILITY_MODULE_ORDER", () => {
    const groups = groupCapabilitiesByModule();
    const seenOrder = groups.map((g) => g.module);
    let lastIdx = -1;
    for (const m of seenOrder) {
      const idx = CAPABILITY_MODULE_ORDER.indexOf(m);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("contains every capability exactly once", () => {
    const groups = groupCapabilitiesByModule();
    const flat = groups.flatMap((g) => g.capabilities);
    expect(flat.length).toBe(ASSISTANT_CAPABILITIES.length);
  });
});

describe("searchCapabilities", () => {
  it("returns all when query is empty", () => {
    expect(searchCapabilities("").length).toBe(ASSISTANT_CAPABILITIES.length);
    expect(searchCapabilities("   ").length).toBe(
      ASSISTANT_CAPABILITIES.length,
    );
  });

  it("matches by label", () => {
    const r = searchCapabilities("Ранковий");
    expect(r.some((c) => c.id === "morning_briefing")).toBe(true);
  });

  it("matches by example phrasing", () => {
    const r = searchCapabilities("каву");
    expect(r.some((c) => c.id === "create_transaction")).toBe(true);
  });

  it("matches by keyword", () => {
    const r = searchCapabilities("workout");
    expect(r.some((c) => c.id === "start_workout")).toBe(true);
  });

  it("is case-insensitive", () => {
    const lower = searchCapabilities("звичка");
    const upper = searchCapabilities("ЗВИЧКА");
    expect(lower.length).toBe(upper.length);
  });

  it("matches by module name", () => {
    const r = searchCapabilities("nutrition");
    const moduleEntries = ASSISTANT_CAPABILITIES.filter(
      (c) => c.module === ("nutrition" satisfies CapabilityModule),
    );
    // All nutrition entries must be in the result (their module string contains 'nutrition').
    for (const c of moduleEntries) {
      expect(r.some((x) => x.id === c.id)).toBe(true);
    }
  });
});
