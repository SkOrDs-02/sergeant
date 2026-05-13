import { describe, it, expect } from "vitest";
import {
  FIRST_ENTRY_CELEBRATIONS,
  getFirstEntryCelebrationCopy,
} from "./onboardingCelebrations";
import { DASHBOARD_MODULE_IDS } from "./dashboard";

describe("onboardingCelebrations", () => {
  it("provides distinct headlines per module + default", () => {
    const headlines = new Set<string>();
    for (const id of [...DASHBOARD_MODULE_IDS, "default"] as const) {
      headlines.add(FIRST_ENTRY_CELEBRATIONS[id].headline);
    }
    // 4 modules + default = 5 distinct headlines (no copy collapse).
    expect(headlines.size).toBe(5);
  });

  it("does not brag about engineering speed", () => {
    // Audit guard: the previous copy was «Готово за {N} с!» /
    // «Блискавично!» — both reframe the celebration to be about app
    // performance instead of the user's action. Reject any copy that
    // reintroduces speed-language at review time.
    const banned = [/блискавично/i, /за\s*\d/i, /\d\s*сек/i, /швидко/i];
    for (const id of [...DASHBOARD_MODULE_IDS, "default"] as const) {
      const { headline, subtext } = FIRST_ENTRY_CELEBRATIONS[id];
      for (const pattern of banned) {
        expect(headline).not.toMatch(pattern);
        expect(subtext).not.toMatch(pattern);
      }
    }
  });

  it("getFirstEntryCelebrationCopy returns module copy when given an id", () => {
    expect(getFirstEntryCelebrationCopy("finyk")).toEqual(
      FIRST_ENTRY_CELEBRATIONS.finyk,
    );
    expect(getFirstEntryCelebrationCopy("nutrition")).toEqual(
      FIRST_ENTRY_CELEBRATIONS.nutrition,
    );
  });

  it("getFirstEntryCelebrationCopy falls back to default on null", () => {
    expect(getFirstEntryCelebrationCopy(null)).toEqual(
      FIRST_ENTRY_CELEBRATIONS.default,
    );
  });

  it("routine subtext leads with outcome — not «Серія / Streak» mechanism (S6.6)", () => {
    // Audit B-4: routine first-entry copy used to be «Перший день
    // рахується. Streak з'явиться після другого підряд.» The «Streak
    // з'явиться» / «Серія днів: N» framing is *mechanism-first* and
    // reads as a 0-streak shame indicator on day 1. Outcome-first
    // re-frames the same idea around what the user is buying with
    // persistence — an automatic habit. These guards lock the frame
    // so a copy-tweak PR cannot quietly bring the mechanism back.
    const { subtext } = FIRST_ENTRY_CELEBRATIONS.routine;
    expect(subtext).toMatch(/автоматичн/);
    const banned = [
      /\bстрик\b/i,
      /\bstreak\b/i,
      /\bСерія днів\b/i,
      /Streak з'явиться/i,
    ];
    for (const pattern of banned) {
      expect(subtext).not.toMatch(pattern);
    }
  });

  it("each module exposes a non-empty nextStepTip and primaryCtaLabel (B-11 / P2-15)", () => {
    // 2026-05-13 roast — both fields are mandatory copy props; an
    // empty value would silently render an awkward empty paragraph
    // or bare button. The shape contract here doubles as a
    // copy-reviewer signal that the field exists at all.
    for (const id of [...DASHBOARD_MODULE_IDS, "default"] as const) {
      const copy = FIRST_ENTRY_CELEBRATIONS[id];
      expect(copy.nextStepTip.length).toBeGreaterThan(0);
      expect(copy.nextStepTip.length).toBeLessThanOrEqual(120);
      expect(copy.primaryCtaLabel.length).toBeGreaterThan(0);
      expect(copy.primaryCtaLabel.length).toBeLessThanOrEqual(28);
      // CTA labels are imperative, no trailing punctuation (so they
      // read like buttons, not sentences).
      expect(copy.primaryCtaLabel).not.toMatch(/[.!…]$/);
    }
  });

  it("nextStepTip is concrete — never the generic «продовжуй додавати записи» TODO (B-11)", () => {
    // Audit B-11 §2.9: «Що далі» tips that just say «Продовжуй
    // додавати записи. Після кількох днів отримаєш перші інсайти…»
    // collapse the celebration moment into another TODO. The guard
    // blocks regression to the pre-2026-05-13 generic tip.
    const banned = [/продовжуй додавати записи/i, /кількох днів отримаєш/i];
    for (const id of [...DASHBOARD_MODULE_IDS, "default"] as const) {
      const { nextStepTip } = FIRST_ENTRY_CELEBRATIONS[id];
      for (const pattern of banned) {
        expect(nextStepTip).not.toMatch(pattern);
      }
    }
  });

  it("each module has a distinct primaryCtaLabel — no generic «Продовжити» fallback for known modules (P2-15)", () => {
    // The default copy may still ship «Продовжити» (because we have
    // no module context to promise against), but per-module copy
    // must hand back a concrete next-action label.
    for (const id of DASHBOARD_MODULE_IDS) {
      const { primaryCtaLabel } = FIRST_ENTRY_CELEBRATIONS[id];
      expect(primaryCtaLabel).not.toBe("Продовжити");
    }
    // Sanity-check that labels are distinct per module so the copy
    // does not collapse to one shared string later by accident.
    const labels = new Set(
      DASHBOARD_MODULE_IDS.map(
        (id) => FIRST_ENTRY_CELEBRATIONS[id].primaryCtaLabel,
      ),
    );
    expect(labels.size).toBe(DASHBOARD_MODULE_IDS.length);
  });
});
