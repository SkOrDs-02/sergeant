/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * A3, поставка 2. Головне тут не перебір комбінацій, а два інваріанти:
 * **офлайн сильніший за вхід** і **тариф із квотою до старту не
 * вгадуються**.
 */
import { describe, expect, it } from "vitest";

import { resolveFeatureDenial, type GatedFeature } from "./featureAccess";

const ALL: GatedFeature[] = [
  "chat",
  "receipt-scan",
  "meal-photo",
  "week-plan",
  "day-plan",
  "shopping-list",
  "recipes",
  "pantry-parse",
  "cloud-backup",
  "voice-input",
];

describe("resolveFeatureDenial", () => {
  it("lets an online account through, on every gated surface", () => {
    for (const feature of ALL) {
      expect(
        resolveFeatureDenial(feature, { hasAccount: true, online: true }),
      ).toBeNull();
    }
  });

  it("stops an anonymous visitor before the request, on every surface", () => {
    // Рівно те, чого бракувало шести поверхням: відмова ДО старту, а не
    // 401 після того, як людина щось вклала.
    for (const feature of ALL) {
      expect(
        resolveFeatureDenial(feature, { hasAccount: false, online: true }),
      ).toEqual({ reason: "sign-in-required" });
    }
  });

  it("says «offline», not «sign in», when both are true", () => {
    // ЦЕ головний інваріант. Вхід теж потребує мережі, тож пропозиція
    // увійти офлайн веде людину у другу стіну одразу після першої.
    expect(
      resolveFeatureDenial("chat", { hasAccount: false, online: false }),
    ).toEqual({ reason: "offline" });
  });

  it("says «offline» for a signed-in user without network too", () => {
    expect(
      resolveFeatureDenial("recipes", { hasAccount: true, online: false }),
    ).toEqual({ reason: "offline" });
  });

  it("never invents a plan or quota verdict before the request", () => {
    // Знімок білінгу може ще не приїхати, а лічильник квоти живе на
    // сервері. Здогадка тут відмовила б людині, якій насправді можна;
    // обидві причини приходять із сервера через `resolveDenial`.
    for (const feature of ALL) {
      for (const online of [true, false]) {
        for (const hasAccount of [true, false]) {
          const denial = resolveFeatureDenial(feature, { hasAccount, online });
          expect(denial?.reason).not.toBe("plan-required");
          expect(denial?.reason).not.toBe("quota-exhausted");
        }
      }
    }
  });
});
