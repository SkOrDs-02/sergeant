import { describe, it, expect } from "vitest";
import { categoryColors } from "@sergeant/design-tokens";
import {
  buildExpenseCategoryList,
  getCatColor,
  getCatTiers,
  getCategorySpendList,
  resolveCatTiers,
} from "./categories";
import {
  LEGACY_INCOME_IDS,
  MANUAL_EXPENSE_TAXONOMY,
  MANUAL_INCOME_TAXONOMY,
} from "../lib/manualTaxonomy";

describe("categories: getCatColor", () => {
  // Очікування читаємо з токенів, а не з літерала: інакше кожен зсув
  // hue в `categoryColors.gen.js` ламав би цей тест, хоча контракт
  // («колір категорії приходить із дизайн-токенів») не змінився. Сам
  // склад палітри гейтить `categoryColors.contract.test.js`.
  it("returns the preset color for known ids", () => {
    expect(getCatColor("food")).toBe(categoryColors.food.solid);
    expect(getCatColor("restaurant")).toBe(categoryColors.restaurant.solid);
  });

  it("falls back to custom color, then palette by idx", () => {
    expect(
      getCatColor("custom1", [{ id: "custom1", color: "#abcdef" } as never]),
    ).toBe("#abcdef");
    const a = getCatColor("unknown", [], 0);
    const b = getCatColor("unknown", [], 1);
    expect(a).not.toBe(b);
  });
});

describe("categories: getCatTiers", () => {
  it("returns the full tier set for a builtin id", () => {
    expect(getCatTiers("transport")).toBe(categoryColors.transport);
  });

  // Кастомний hex свідомо ігнорується: один довільний колір не дає пари
  // фон/чорнило, тож чип із нього був би нечитабельним.
  it("ignores the user's raw hex and wraps the fallback palette by idx", () => {
    const a = getCatTiers("custom1", 0);
    const b = getCatTiers("custom1", 1);
    expect(a).not.toBe(b);
    expect(getCatTiers("custom1", 0)).toBe(a);
  });
});

describe("categories: тир кожної категорії з таксономії ручної форми", () => {
  // Регресія 2026-08-13. Жоден income-id не мав запису в палітрі, тож
  // `getCatTiers` віддавав їм ПЕРШИЙ fallback-тир — а це буквально
  // `categoryFallbackOrder[0]` === "transport". У стрічці це читалось
  // як «усі надходження належать до категорії Транспорт».
  it("усі надходження беруть спільний тир income, а не колір транспорту", () => {
    const incomeIds = [
      ...MANUAL_INCOME_TAXONOMY.map((d) => d.id),
      ...LEGACY_INCOME_IDS,
    ];
    for (const id of incomeIds) {
      expect(getCatTiers(id), `income-id "${id}"`).toBe(categoryColors.income);
      expect(getCatTiers(id), `income-id "${id}"`).not.toBe(
        categoryColors.transport,
      );
    }
  });

  it("кожна ручна категорія витрати має тир своєї канонічної категорії", () => {
    for (const def of MANUAL_EXPENSE_TAXONOMY) {
      const tiers = categoryColors[def.canonicalId as "food"];
      expect(
        tiers,
        `канонічної категорії "${def.canonicalId}" немає в палітрі`,
      ).toBeDefined();
      expect(getCatTiers(def.id), `ручний slug "${def.id}"`).toBe(tiers);
    }
  });

  // `groceries`/`cafe`/`tech` — три слаги, яких немає в MCC-каталозі.
  // Саме на них колір і агрегація раніше розходились.
  it("детальні ручні слаги діляться кольором із канонічною категорією", () => {
    expect(getCatTiers("groceries")).toBe(getCatTiers("food"));
    expect(getCatTiers("cafe")).toBe(getCatTiers("restaurant"));
    expect(getCatTiers("tech")).toBe(getCatTiers("shopping"));
  });
});

describe("categories: resolveCatTiers — стабільність кольору кастомної категорії", () => {
  const custom = [
    { id: "custom_a", label: "A" },
    { id: "custom_b", label: "B" },
    { id: "custom_c", label: "C" },
  ];

  // Регресія 2026-08-13: строка транзакції не передавала idx (тобто 0),
  // пікер передавав номер чипа, діаграма — місце в сортуванні за сумою.
  // Одна категорія мала три різні кольори одночасно.
  it("дає один тир незалежно від позиції у списку рендеру", () => {
    const fromRow = resolveCatTiers("custom_c", custom);
    const merged = [
      { id: "food", label: "Їжа" },
      { id: "transport", label: "Транспорт" },
      ...custom,
    ];
    expect(resolveCatTiers("custom_c", merged)).toBe(fromRow);
  });

  it("сусідні за створенням категорії дістають різні тири", () => {
    const a = resolveCatTiers("custom_a", custom);
    const b = resolveCatTiers("custom_b", custom);
    expect(a).not.toBe(b);
  });

  it("вбудована категорія ігнорує список і тримає власний тир", () => {
    expect(resolveCatTiers("food", custom)).toBe(categoryColors.food);
    expect(resolveCatTiers("food", [])).toBe(categoryColors.food);
  });
});

describe("categories: buildExpenseCategoryList", () => {
  it("excludes income by default, includes custom categories", () => {
    const list = buildExpenseCategoryList([
      { id: "custom_x", label: "X", emoji: "🧪" } as never,
    ]);
    expect(list.some((c) => c.id === "income")).toBe(false);
    expect(list.some((c) => c.id === "custom_x")).toBe(true);
  });

  it("returns base expense categories regardless of excludeIncome flag", () => {
    const a = buildExpenseCategoryList([]);
    const b = buildExpenseCategoryList([], { excludeIncome: false });
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThanOrEqual(a.length);
    expect(b.some((c) => c.id === "food")).toBe(true);
  });
});

describe("categories: getCategorySpendList", () => {
  it("aggregates spend per category, sorts desc, drops zeros", () => {
    const txs = [
      { id: "1", amount: -10000, mcc: 5411, description: "" },
      { id: "2", amount: -5000, mcc: 5411, description: "" },
      { id: "3", amount: -20000, mcc: 4111, description: "" },
      { id: "4", amount: 5000, mcc: 0, description: "salary" },
    ];
    const res = getCategorySpendList(txs);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]!.spent).toBeGreaterThanOrEqual(res[res.length - 1]!.spent);
    expect(res.every((c) => c.id !== "income")).toBe(true);
    expect(res.every((c) => c.spent > 0)).toBe(true);
  });
});
