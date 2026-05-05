import { describe, it, expect } from "vitest";
import {
  ONBOARDING_HERO_COPY_EXPERIMENT,
  getOnboardingHeroCopy,
} from "./onboardingHeroCopy";

describe("getOnboardingHeroCopy — outcome variant (S1.1 mainline)", () => {
  it("leads with a user-outcome promise, not a product category", () => {
    const copy = getOnboardingHeroCopy("outcome");
    expect(copy.title).toBe(
      "Запиши перший зум — і побачиш, куди йде твоє життя.",
    );
    // The audit explicitly called out "хаб" as marketer-speak.
    expect(copy.title).not.toMatch(/хаб/i);
    // "все в одному місці" is the dead overused cliché we're replacing.
    expect(copy.subtitle).not.toMatch(/все в одному місці/i);
  });

  it("anchors the next-30-seconds promise in the subtitle", () => {
    const copy = getOnboardingHeroCopy("outcome");
    expect(copy.subtitle).toContain("30 секунд");
    expect(copy.subtitle).toContain("без реєстрації");
  });

  it("uses three concrete negative-claim badges (verifiable)", () => {
    const copy = getOnboardingHeroCopy("outcome");
    expect(copy.badges).toEqual([
      "Без реєстрації",
      "Без cloud-у",
      "Без реклами",
    ]);
    // Banned: vague privacy claims that the user can't verify.
    for (const badge of copy.badges) {
      expect(badge).not.toMatch(/^Приватн/i);
      expect(badge).not.toMatch(/^Локальн/i);
    }
  });

  it("uses an action verb in the primary CTA, not a feature-noun", () => {
    const copy = getOnboardingHeroCopy("outcome");
    expect(copy.primaryCta).toBe("Розпочати — 30 секунд");
    // Banned: pre-S1.2 feature-flavoured CTA copy.
    expect(copy.primaryCta).not.toMatch(/^Відкрити Sergeant/);
    expect(copy.primaryCta).not.toMatch(/^Налаштувати модулі/);
    expect(copy.primaryCta).not.toMatch(/^Створити акаунт/);
  });
});

describe("getOnboardingHeroCopy — safe variant", () => {
  it("removes 'хаб' but keeps the four-domain list", () => {
    const copy = getOnboardingHeroCopy("safe");
    expect(copy.title).toBe("Один екран замість шести застосунків.");
    expect(copy.title).not.toMatch(/хаб/i);
    expect(copy.subtitle).toContain("Гроші");
    expect(copy.subtitle).toContain("тренування");
  });
});

describe("getOnboardingHeroCopy — bold variant", () => {
  it("uses an exclusionary lead targeting the 'tired of forgetting' cohort", () => {
    const copy = getOnboardingHeroCopy("bold");
    expect(copy.title).toBe("Не для всіх. Для тих, хто втомився забувати.");
    expect(copy.subtitle).toContain("пам'ятає за тебе");
  });
});

describe("getOnboardingHeroCopy — disciplined variant (PR-04)", () => {
  it("frames the product as a coach, not as four domains", () => {
    const copy = getOnboardingHeroCopy("disciplined");
    expect(copy.title).toBe("Менше хаосу. Більше зробленого.");
    // The disciplined arm must avoid marketer-speak too.
    expect(copy.title).not.toMatch(/хаб/i);
    expect(copy.subtitle).not.toMatch(/все в одному місці/i);
  });

  it("keeps the no-account / no-cloud commitments in the subtitle", () => {
    const copy = getOnboardingHeroCopy("disciplined");
    expect(copy.subtitle).toMatch(/без акаунта/i);
    expect(copy.subtitle).toMatch(/cloud/i);
  });

  it("reuses the canonical badge triplet so trust signals don't drift", () => {
    const copy = getOnboardingHeroCopy("disciplined");
    expect(copy.badges).toEqual([
      "Без реєстрації",
      "Без cloud-у",
      "Без реклами",
    ]);
  });
});

describe("ONBOARDING_HERO_COPY_EXPERIMENT", () => {
  it("declares four variants under the v2 id with outcome favoured", () => {
    expect(ONBOARDING_HERO_COPY_EXPERIMENT.id).toBe("onboarding_hero_copy_v2");
    expect(ONBOARDING_HERO_COPY_EXPERIMENT.variants).toEqual([
      "outcome",
      "safe",
      "bold",
      "disciplined",
    ]);
    expect(ONBOARDING_HERO_COPY_EXPERIMENT.weights).toEqual([
      0.4, 0.2, 0.2, 0.2,
    ]);
  });

  it("keeps weights summing to 1 so abTest assignment never falls through", () => {
    const weights = ONBOARDING_HERO_COPY_EXPERIMENT.weights;
    expect(weights).toBeDefined();
    if (!weights) return;
    const sum = weights.reduce((acc, w) => acc + w, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("audit-guard — banned phrasing must not return", () => {
  it("none of the variants resurrect 'хаб' or 'все в одному місці'", () => {
    for (const variant of ["outcome", "safe", "bold", "disciplined"] as const) {
      const copy = getOnboardingHeroCopy(variant);
      const all = `${copy.title} ${copy.subtitle} ${copy.primaryCta}`;
      expect(all, `variant=${variant}`).not.toMatch(/твій хаб/i);
      expect(all, `variant=${variant}`).not.toMatch(/все в одному місці/i);
    }
  });
});
