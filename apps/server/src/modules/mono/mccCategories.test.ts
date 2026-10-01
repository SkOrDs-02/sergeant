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

  // П'ять категорій 2026-10-01: вебхук штампує слаг із цього ж каталогу.
  it("повертає слаги нових категорій", () => {
    expect(categorizeMcc(4814)).toBe("telecom");
    expect(categorizeMcc(4812)).toBe("telecom");
    expect(categorizeMcc(4816)).toBe("telecom");
    expect(categorizeMcc(5200)).toBe("home");
    expect(categorizeMcc(5712)).toBe("home");
    // 742, а не 0742: восьмеричний літерал у модулі — SyntaxError.
    expect(categorizeMcc(742)).toBe("pets");
    expect(categorizeMcc(5995)).toBe("pets");
    expect(categorizeMcc(5947)).toBe("gifts");
    expect(categorizeMcc(5992)).toBe("gifts");
  });

  // AI-DANGER: штамп `category_slug` живе в БД вічно й читається вебом як
  // канонічний `categoryId` (див. міграцію 136). 4829 бачить лише клієнтський
  // резолвер: у нього є опис (поповнення банки → «Перекази людям») і override.
  it("мовчить на 4829 — перекази людям резолвить клієнт, а не штамп", () => {
    expect(categorizeMcc(4829)).toBeNull();
  });

  it("4899 лишається «Підписками» — не перекладений у звʼязок", () => {
    expect(categorizeMcc(4899)).toBe("subscriptions");
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
