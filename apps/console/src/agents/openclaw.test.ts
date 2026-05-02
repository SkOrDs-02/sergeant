import { describe, expect, it } from "vitest";
import { buildSystemPromptInline, selectToneMode } from "./openclaw.js";

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
