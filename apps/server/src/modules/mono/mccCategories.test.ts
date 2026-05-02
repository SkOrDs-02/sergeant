import { describe, it, expect } from "vitest";
import { categorizeMcc, getMccToCategoryMap } from "./mccCategories.js";

describe("categorizeMcc", () => {
  it("повертає 'food' для grocery MCC", () => {
    expect(categorizeMcc(5411)).toBe("food");
    expect(categorizeMcc(5412)).toBe("food");
    expect(categorizeMcc(5499)).toBe("food");
  });

  it("повертає 'restaurant' для food-service MCC", () => {
    expect(categorizeMcc(5812)).toBe("restaurant");
    expect(categorizeMcc(5813)).toBe("restaurant");
    expect(categorizeMcc(5814)).toBe("restaurant");
  });

  it("повертає 'transport' для transport / gas-station MCC", () => {
    expect(categorizeMcc(4111)).toBe("transport");
    expect(categorizeMcc(4121)).toBe("transport");
    expect(categorizeMcc(5541)).toBe("transport");
  });

  it("повертає 'subscriptions' для digital-services MCC", () => {
    expect(categorizeMcc(5735)).toBe("subscriptions");
    expect(categorizeMcc(7372)).toBe("subscriptions");
    expect(categorizeMcc(4899)).toBe("subscriptions");
  });

  it("повертає 'health' для аптек / клінік", () => {
    expect(categorizeMcc(5912)).toBe("health");
    expect(categorizeMcc(8011)).toBe("health");
    expect(categorizeMcc(8021)).toBe("health");
  });

  it("повертає 'travel' для авіа / готелів", () => {
    expect(categorizeMcc(4511)).toBe("travel");
    expect(categorizeMcc(7011)).toBe("travel");
  });

  it("повертає null для MCC = 0", () => {
    expect(categorizeMcc(0)).toBeNull();
  });

  it("повертає null для null / undefined", () => {
    expect(categorizeMcc(null)).toBeNull();
    expect(categorizeMcc(undefined)).toBeNull();
  });

  it("повертає null для невідомого MCC", () => {
    expect(categorizeMcc(1234)).toBeNull();
    expect(categorizeMcc(9999)).toBeNull();
  });

  it("включає щонайменше 50 MCC у мапі", () => {
    // Sanity: roadmap C обіцяє ~50 найпоширеніших MCC. Якщо хтось випадково
    // вирізав половину з MCC_CATEGORIES — цей expect упаде раніше за інтеграційні.
    const map = getMccToCategoryMap();
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(50);
  });

  it("кожен entry мапить на непорожній slug", () => {
    const map = getMccToCategoryMap();
    for (const [mcc, slug] of Object.entries(map)) {
      expect(Number.isInteger(Number(mcc))).toBe(true);
      expect(typeof slug).toBe("string");
      expect(slug.length).toBeGreaterThan(0);
    }
  });
});
