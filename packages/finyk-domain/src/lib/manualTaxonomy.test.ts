import { describe, it, expect } from "vitest";
import { categoryColors } from "@sergeant/design-tokens";
import { MCC_CATEGORIES } from "../constants";
import {
  MANUAL_EXPENSE_TAXONOMY,
  MANUAL_INCOME_TAXONOMY,
  MANUAL_TAXONOMY_BY_ID,
  canonicalManualCategoryId,
  legacyManualCategoryId,
  stripCategoryEmoji,
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

describe("підписи таксономії", () => {
  // Регресія на репорт тестувальника 2026-08-21: у картці ліміту стояло
  // емодзі, у рядку транзакції — іконка, бо резолвер віддавав
  // `"🛒 Продукти"`, а зрізали префікс лише ті поверхні, які про нього
  // знали. Емодзі більше не існує в даних, тож розійтись немає чому.
  it("жоден підпис не містить емодзі", () => {
    for (const d of [...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY]) {
      expect(d.label, `"${d.id}"`).toBe(stripCategoryEmoji(d.label));
      expect(/\p{Extended_Pictographic}/u.test(d.label), `"${d.id}"`).toBe(
        false,
      );
    }
  });
});

describe("legacyManualCategoryId — підписи Ер 1–2", () => {
  it("голий український підпис (Ера 1) → слаг", () => {
    expect(legacyManualCategoryId("їжа")).toBe("food");
    expect(legacyManualCategoryId("продукти")).toBe("food");
    expect(legacyManualCategoryId("транспорт")).toBe("transport");
    expect(legacyManualCategoryId("інше")).toBe("other");
  });

  it("емодзі-префіксований підпис (Ера 2) → той самий слаг", () => {
    expect(legacyManualCategoryId("🍴 їжа")).toBe("food");
    expect(legacyManualCategoryId("🛒 Продукти")).toBe("food");
    expect(legacyManualCategoryId("✈️ подорожі")).toBe("travel");
  });

  it("резолвить підпис у БУДЬ-ЯКІЙ формі апострофа", () => {
    // Канон §1.10: підпис у коді канонічний (`ʼ`), але у сховищі
    // користувача лежить те, що записали попередні версії — через ASCII
    // `'`. Перевіряємо кожну форму окремо: якщо згортання на межі
    // зникне, «Здоров'я» зі старих даних мовчки поїде в «Інше», і жоден
    // інший тест цього не побачить.
    const forms = ["'", "’", "ʼ"];
    expect(new Set(forms).size).toBe(3);
    for (const a of forms) {
      expect(legacyManualCategoryId(`здоров${a}я`)).toBe("health");
      expect(legacyManualCategoryId(`💊 Здоров${a}я`)).toBe("health");
    }
  });

  // `продукти` свідомо резолвиться у канонічний `food`, а не в
  // legacy-аліас `groceries`: підпис однаковий, але лише `food`
  // лишився опцією пікера, тож форма редагування старого запису
  // відкривається на наявному чипі.
  it("веде в id, який реально є в пікері", () => {
    expect(legacyManualCategoryId("продукти")).not.toBe("groceries");
  });

  // Ключове: НЕ `"other"`. Кастомна категорія теж «незнайома» цій мапі,
  // і звести її до «Інше» означало б підмінити дані мовчки.
  it("незнайомий рядок і порожнє значення → undefined", () => {
    expect(legacyManualCategoryId("кава з друзями")).toBeUndefined();
    expect(legacyManualCategoryId("")).toBeUndefined();
    expect(legacyManualCategoryId(null)).toBeUndefined();
  });

  it("stripCategoryEmoji знімає складені емодзі цілком", () => {
    expect(stripCategoryEmoji("🍴 їжа")).toBe("їжа");
    expect(stripCategoryEmoji("✈️ подорожі")).toBe("подорожі");
    expect(stripCategoryEmoji("їжа")).toBe("їжа");
  });
});
