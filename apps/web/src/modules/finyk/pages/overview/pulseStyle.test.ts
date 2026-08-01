import { describe, it, expect } from "vitest";
import { computePulseStyle } from "./pulseStyle";

describe("computePulseStyle — with expense plan", () => {
  it("returns danger accent when spendPlanRatio > 0.75", () => {
    const s = computePulseStyle({
      hasExpensePlan: true,
      spendPlanRatio: 0.8,
      dayBudget: 100,
    });
    expect(s.color).toBe("text-danger");
    expect(s.accentLeft).toBe("border-l-danger");
    expect(s.statusText).toBe("Понад 75% запланованого");
  });

  it("returns warning accent when spendPlanRatio is between 0.5 and 0.75", () => {
    const s = computePulseStyle({
      hasExpensePlan: true,
      spendPlanRatio: 0.6,
      dayBudget: 100,
    });
    expect(s.color).toBe("text-warning");
    expect(s.accentLeft).toBe("border-l-warning");
    expect(s.statusText).toBe("Понад 50% запланованого");
  });

  it("returns success accent when spendPlanRatio <= 0.5", () => {
    const s = computePulseStyle({
      hasExpensePlan: true,
      spendPlanRatio: 0.4,
      dayBudget: 100,
    });
    expect(s.color).toBe("text-success");
    expect(s.accentLeft).toBe("border-l-success");
    expect(s.statusText).toBe("В межах плану");
  });

  it("uses exact boundary — spendPlanRatio exactly 0.75 is warning, not danger", () => {
    const s = computePulseStyle({
      hasExpensePlan: true,
      spendPlanRatio: 0.75,
      dayBudget: 50,
    });
    expect(s.color).toBe("text-warning");
  });

  it("uses exact boundary — spendPlanRatio exactly 0.5 is success, not warning", () => {
    const s = computePulseStyle({
      hasExpensePlan: true,
      spendPlanRatio: 0.5,
      dayBudget: 50,
    });
    expect(s.color).toBe("text-success");
  });
});

describe("computePulseStyle — without expense plan (dayBudget mode)", () => {
  it("returns success when dayBudget >= 200", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: 500,
    });
    expect(s.color).toBe("text-success");
    expect(s.accentLeft).toBe("border-l-success");
    expect(s.statusText).toBe("В нормі");
  });

  it("returns warning when dayBudget is between 0 and 200 (exclusive)", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: 100,
    });
    expect(s.color).toBe("text-warning");
    expect(s.accentLeft).toBe("border-l-warning");
    expect(s.statusText).toBe("Обережно — майже вичерпано");
  });

  it("returns danger when dayBudget < 0 (overspent)", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: -50,
    });
    expect(s.color).toBe("text-danger");
    expect(s.accentLeft).toBe("border-l-danger");
    expect(s.statusText).toBe("Перевитрата");
  });

  it("treats dayBudget exactly 0 as warning (not danger)", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: 0,
    });
    expect(s.color).toBe("text-warning");
  });

  it("treats dayBudget exactly 200 as success", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: 200,
    });
    expect(s.color).toBe("text-success");
  });
});

// Regression: founder report 2026-07-31 — the hero claimed «124 686 ₴/день ·
// В нормі» with «Денний план: не задано» right below it. Without a plan there
// is no honest day budget, so `useOverviewData` now passes `null`.
describe("computePulseStyle — no monthly plan (dayBudget = null)", () => {
  it("returns a neutral tone and the 'План не заданий' status", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: null,
    });
    expect(s.statusText).toBe("План не заданий");
    expect(s.color).toBe("text-muted");
  });

  it("paints no verdict-coloured wash or accent", () => {
    // Every `bg-pulse-*` gradient encodes a judgement (ok / warn / over).
    // Without a plan there is nothing to judge, so the neutral branch must
    // carry no wash at all and a plain line-coloured accent.
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: null,
    });
    expect(s.bg).toBe("");
    expect(s.accentLeft).toBe("border-l-line");
  });

  it("never claims a healthy 'В нормі' status without a plan", () => {
    const s = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: null,
    });
    expect(s.statusText).not.toBe("В нормі");
  });
});
