import { describe, it, expect } from "vitest";
import { categoryColors } from "@sergeant/design-tokens";
import { MCC_CATEGORIES } from "../constants";
import {
  MANUAL_EXPENSE_TAXONOMY,
  MANUAL_INCOME_TAXONOMY,
  MANUAL_TAXONOMY_BY_ID,
  canonicalManualCategoryId,
  taxonomyLabel,
} from "./manualTaxonomy";

describe("manualTaxonomy — цілісність таблиці", () => {
  it("id унікальні в межах обох таксономій", () => {
    const ids = [...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY].map(
      (d) => d.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(MANUAL_TAXONOMY_BY_ID.size).toBe(ids.length);
  });

  it("кожен запис має непорожні підпис, іконку й канонічний id", () => {
    for (const d of [...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY]) {
      expect(d.label, `"${d.id}" без підпису`).toBeTruthy();
      expect(d.iconName, `"${d.id}" без іконки`).toBeTruthy();
      expect(d.canonicalId, `"${d.id}" без канонічного id`).toBeTruthy();
    }
  });

  // Саме через це раніше не можна було довіритись жодній із чотирьох
  // копій списку: колір існував там, де підпис уже поїхав.
  it("канонічний id кожної категорії існує в палітрі", () => {
    for (const d of [...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY]) {
      expect(
        categoryColors[d.canonicalId as "food"],
        `канонічної категорії "${d.canonicalId}" (з "${d.id}") немає в палітрі`,
      ).toBeDefined();
    }
  });

  // `groceries`/`cafe`/`tech` існують ЛИШЕ в ручній формі — банк на ці
  // витрати дає той самий MCC. Решта слагів мусить збігатися з
  // MCC-каталогом, інакше зʼявиться ще один «свій» id без даху.
  it("слаг без запису в MCC-каталозі має канонічний id, відмінний від себе", () => {
    const mccIds = new Set(MCC_CATEGORIES.map((c) => c.id));
    // `utilities` і `other` — виняток: у палітрі є, у MCC-каталозі нема.
    const paletteOnly = new Set(["utilities", "other"]);
    for (const d of MANUAL_EXPENSE_TAXONOMY) {
      if (mccIds.has(d.id) || paletteOnly.has(d.id)) {
        expect(d.canonicalId, `"${d.id}"`).toBe(d.id);
      } else {
        expect(
          d.canonicalId,
          `"${d.id}" мусить мати канонічну категорію`,
        ).not.toBe(d.id);
        expect(mccIds.has(d.canonicalId), `"${d.canonicalId}"`).toBe(true);
      }
    }
  });

  it("усі надходження зводяться до спільного тира income", () => {
    for (const d of MANUAL_INCOME_TAXONOMY) {
      expect(d.canonicalId).toBe("income");
    }
  });
});

describe("canonicalManualCategoryId", () => {
  it("зводить детальні слаги ручної форми до канонічної категорії", () => {
    expect(canonicalManualCategoryId("groceries")).toBe("food");
    expect(canonicalManualCategoryId("cafe")).toBe("restaurant");
    expect(canonicalManualCategoryId("tech")).toBe("shopping");
  });

  // Ключова відмінність від `manualCategoryToCanonicalId`: жодної
  // нормалізації регістру, тож id кастомної категорії не спотворюється.
  it("невідомий і кастомний id повертає БЕЗ змін, зберігаючи регістр", () => {
    expect(canonicalManualCategoryId("custom_Kava_Z_Druzyamy")).toBe(
      "custom_Kava_Z_Druzyamy",
    );
    expect(canonicalManualCategoryId("restaurant")).toBe("restaurant");
    expect(canonicalManualCategoryId("")).toBe("");
  });
});

describe("taxonomyLabel", () => {
  it("склеює емодзі з підписом, коли емодзі є", () => {
    const food = MANUAL_TAXONOMY_BY_ID.get("food")!;
    expect(taxonomyLabel(food)).toBe(`${food.emoji} ${food.label}`);
  });

  it("надходження лишаються без емодзі-префікса", () => {
    const salary = MANUAL_TAXONOMY_BY_ID.get("salary")!;
    expect(taxonomyLabel(salary)).toBe("Зарплата");
  });
});
