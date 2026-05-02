import { describe, expect, it } from "vitest";
import {
  ALL_PERSONAS,
  COUNCIL_PERSONAS,
  DEFAULT_PERSONA,
  PERSONA_TOOL_FILTER,
  filterToolsForPersona,
  isOpenClawPersona,
  personaPrimer,
  type OpenClawPersona,
} from "./personas.js";
import { openClawTools } from "./openclaw.js";

describe("OpenClaw personas — registry", () => {
  it("DEFAULT_PERSONA is cofounder", () => {
    expect(DEFAULT_PERSONA).toBe("cofounder");
  });

  it("ALL_PERSONAS lists all five personas in deterministic order", () => {
    expect([...ALL_PERSONAS]).toEqual([
      "cofounder",
      "ops",
      "growth",
      "eng",
      "finance",
    ]);
  });

  it("COUNCIL_PERSONAS excludes cofounder (cofounder is the synthesizer)", () => {
    expect(COUNCIL_PERSONAS).not.toContain("cofounder");
    expect([...COUNCIL_PERSONAS]).toEqual(["ops", "growth", "eng", "finance"]);
  });

  it("isOpenClawPersona type-guard accepts known personas", () => {
    for (const p of ALL_PERSONAS) {
      expect(isOpenClawPersona(p)).toBe(true);
    }
  });

  it("isOpenClawPersona rejects unknown strings", () => {
    expect(isOpenClawPersona("ceo")).toBe(false);
    expect(isOpenClawPersona("")).toBe(false);
    expect(isOpenClawPersona("OPS")).toBe(false); // case-sensitive
  });
});

describe("OpenClaw personas — primers", () => {
  it("each persona has a non-empty primer that names itself", () => {
    for (const persona of ALL_PERSONAS) {
      const primer = personaPrimer(persona);
      expect(primer.length).toBeGreaterThan(20);
      expect(primer).toContain("PERSONA:");
      expect(primer.toLowerCase()).toContain(persona);
    }
  });

  it("specialist primers reference handover for out-of-scope questions", () => {
    // ops, growth, eng send users to other personas for off-topic prompts.
    expect(personaPrimer("ops").toLowerCase()).toMatch(/growth|cofounder/);
    expect(personaPrimer("growth").toLowerCase()).toContain("ops");
    expect(personaPrimer("eng").toLowerCase()).toContain("finance");
  });
});

describe("OpenClaw personas — tool filtering", () => {
  it("cofounder receives the full tool set unchanged", () => {
    const filtered = filterToolsForPersona(openClawTools, "cofounder");
    expect(filtered.length).toBe(openClawTools.length);
    expect(filtered.map((t) => t.name).sort()).toEqual(
      openClawTools.map((t) => t.name).sort(),
    );
  });

  it("specialist filters are subsets of the full tool set", () => {
    const allNames = new Set(openClawTools.map((t) => t.name));
    for (const persona of ["ops", "growth", "eng", "finance"] as const) {
      const allowlist = PERSONA_TOOL_FILTER[persona];
      expect(allowlist).not.toBeNull();
      for (const name of allowlist!) {
        expect(allNames.has(name)).toBe(true);
      }
    }
  });

  it("ops persona scope: incident-relevant tools, no posthog", () => {
    const filtered = filterToolsForPersona(openClawTools, "ops");
    const names = filtered.map((t) => t.name);
    expect(names).toContain("get_sentry_issues");
    expect(names).toContain("get_server_stats");
    expect(names).toContain("read_workflow_logs");
    expect(names).not.toContain("get_posthog_stats");
    expect(names).not.toContain("read_strategy_docs");
  });

  it("growth persona scope: posthog/releases/strategy, no incident tools", () => {
    const filtered = filterToolsForPersona(openClawTools, "growth");
    const names = filtered.map((t) => t.name);
    expect(names).toContain("get_posthog_stats");
    expect(names).toContain("get_github_releases");
    expect(names).toContain("read_strategy_docs");
    expect(names).not.toContain("get_sentry_issues");
    expect(names).not.toContain("read_workflow_logs");
  });

  it("eng persona scope: github + db + tg engineering, no Stripe/Sentry", () => {
    const filtered = filterToolsForPersona(openClawTools, "eng");
    const names = filtered.map((t) => t.name);
    expect(names).toContain("read_github");
    expect(names).toContain("query_app_db");
    expect(names).toContain("read_telegram_topic_history");
    expect(names).not.toContain("get_stripe_metrics");
    expect(names).not.toContain("get_sentry_issues");
  });

  it("finance persona scope: stripe + memory + decisions only", () => {
    const filtered = filterToolsForPersona(openClawTools, "finance");
    const names = filtered.map((t) => t.name);
    expect(names).toContain("get_stripe_metrics");
    expect(names).toContain("recall_memory");
    expect(names).toContain("record_decision");
    expect(names).not.toContain("get_sentry_issues");
    expect(names).not.toContain("get_posthog_stats");
    expect(names).not.toContain("read_github");
  });

  it("recall_memory is shared by every persona (cofounder context lives here)", () => {
    for (const persona of ALL_PERSONAS) {
      const filtered = filterToolsForPersona(openClawTools, persona);
      expect(filtered.map((t) => t.name)).toContain("recall_memory");
    }
  });

  it("filterToolsForPersona never mutates the original tool list", () => {
    const before = openClawTools.length;
    filterToolsForPersona(openClawTools, "ops");
    filterToolsForPersona(openClawTools, "growth");
    expect(openClawTools.length).toBe(before);
  });

  it("unknown persona at type-erased call sites returns empty list", () => {
    // Defensive: cast through `as` to simulate a corrupted call site.
    const fake = "ceo" as OpenClawPersona;
    // ⚠️ The map has no entry for "ceo"; PERSONA_TOOL_FILTER lookup is
    // undefined, which yields a noop filter (empty allowlist). This is the
    // documented fail-closed contract: unknown personas see no tools.
    expect(filterToolsForPersona(openClawTools, fake)).toEqual([]);
  });
});
