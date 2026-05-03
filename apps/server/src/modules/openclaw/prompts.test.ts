import { describe, expect, it } from "vitest";
import { buildSystemPrompt, selectToneMode } from "./prompts.js";

describe("server-side selectToneMode", () => {
  it("defaults to diplomatic", () => {
    expect(selectToneMode("hi")).toBe("diplomatic");
  });

  it("matches direct keywords (English)", () => {
    expect(selectToneMode("incident у білінгу")).toBe("direct");
    expect(selectToneMode("CI is broken")).toBe("direct");
    expect(selectToneMode("rollback the deploy")).toBe("direct");
  });

  it("matches direct keywords (Ukrainian)", () => {
    expect(selectToneMode("у нас інцидент")).toBe("direct");
    expect(selectToneMode("сервер впав")).toBe("direct");
  });

  it("matches diplomatic keywords", () => {
    expect(selectToneMode("розглянути стратегію OKR")).toBe("diplomatic");
    expect(selectToneMode("vision for next quarter")).toBe("diplomatic");
  });

  it("prefers direct when both keywords present", () => {
    expect(selectToneMode("стратегія по incident response")).toBe("direct");
  });
});

describe("buildSystemPrompt", () => {
  it("contains core role + memory namespace + allowlists", () => {
    const p = buildSystemPrompt({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@founder",
      trigger: "dm",
    });
    expect(p).toContain("source='cofounder'");
    // `users` — sentinel allowlisted table guaranteed to exist у схемі. До
    // цього перевіряли `subscriptions`, але та таблиця aspirational і її
    // прибрано з allowlist-у щоб не плодити Sentry-fatal-ів на read-time.
    expect(p).toContain("users");
    expect(p).toContain("docs/strategy/");
    expect(p).toContain("docs/decisions/");
    expect(p).toContain("FOUNDER: @founder");
    expect(p).toContain("TRIGGER: dm");
  });

  it("interpolates max iterations", () => {
    const p = buildSystemPrompt({
      toneMode: "direct",
      maxIterations: 5,
      founderHandle: "@x",
      trigger: "morning_ritual",
    });
    expect(p).toContain("5 Plan→Act→Reflect");
  });

  it("uses different bodies for direct vs diplomatic", () => {
    const direct = buildSystemPrompt({
      toneMode: "direct",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
    });
    const diplomatic = buildSystemPrompt({
      toneMode: "diplomatic",
      maxIterations: 8,
      founderHandle: "@x",
      trigger: "dm",
    });
    expect(direct).not.toEqual(diplomatic);
    expect(direct).toContain("Cut to the chase");
    expect(diplomatic).toContain("Diplomatic, exploratory");
  });
});
