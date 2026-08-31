// Картка продукту комори: варіанти позиції та інваріант «сума варіантів =
// кількість позиції». Кейси нумеровані за § Верифікація спеки
// `docs/90-work/planning/specs/pantry-generic-names.md`.
import { describe, expect, it } from "vitest";

import { mergeItems } from "./mergeItems.js";
import {
  capSources,
  consumeFromSources,
  pantrySourcesInvariantHolds,
  sourcesTotal,
  syntheticSource,
} from "./pantrySources.js";
import { applyConsumeToPantryItem } from "./pantryConsume.js";
import { receiptPackCount, receiptQtyToBase } from "./units.js";
import { MAX_PANTRY_SOURCES, type PantryItem } from "./pantryTextParser.js";

function source(
  name: string,
  qty: number,
  unit = "мл",
  addedAt = "2026-08-21",
) {
  return { name, qty, unit, addedAt };
}

function fromReceipt(
  name: string,
  qty: number,
  unit: string,
  addedAt: string,
  genericName = "",
): PantryItem {
  const based = receiptQtyToBase(qty, unit, genericName || name);
  if (!based) throw new Error(`не вдалось звести до базової: ${qty} ${unit}`);
  return {
    name: "",
    qty: based.qty,
    unit: based.unit,
    notes: null,
    sources: [{ name, qty: based.qty, unit: based.unit, addedAt }],
  };
}

describe("receiptQtyToBase (рішення 7)", () => {
  it("кейс 8: фасування множиться на кількість — 2 × 0,25 л → 500 мл", () => {
    expect(receiptQtyToBase(2, "0,25л")).toEqual({ qty: 500, unit: "мл" });
  });

  it.each([
    [1, "900г", { qty: 900, unit: "г" }],
    [0.196, "кг", { qty: 196, unit: "г" }],
    [3, "шт", { qty: 3, unit: "шт" }],
    [2, "л", { qty: 2000, unit: "мл" }],
  ])("%s + '%s' → базова одиниця", (qty, unit, expected) => {
    expect(receiptQtyToBase(qty, unit)).toEqual(expected);
  });

  // 900 г молока це НЕ 900 мл: щільність 1.03. Без цієї конверсії головний
  // кейс фічі не спрацьовує саме на молоці — Сільпо віддає його в грамах.
  it("зводить масу рідини до об'єму, коли щільність відома", () => {
    const milk = receiptQtyToBase(1, "900г", "Молоко")!;
    expect(milk.unit).toBe("мл");
    // Ціле число мілілітрів — дробові мл у коморі сенсу не мають.
    expect(milk.qty).toBe(Math.round(900 / 1.03));
    expect(milk.qty).not.toBe(900);
  });

  it("НЕ конвертує, коли щільності немає — дефолт 1.0 сюди не тече", () => {
    // Для продукту поза таблицею «900 г = 900 мл» було б вигаданим числом.
    expect(receiptQtyToBase(1, "900г", "Сир кисломолочний")).toEqual({
      qty: 900,
      unit: "г",
    });
  });

  it("мед у грамах не стає рівною кількістю мілілітрів (1.42)", () => {
    const honey = receiptQtyToBase(1, "400г", "Мед")!;
    expect(honey.unit).toBe("мл");
    expect(honey.qty).toBe(Math.round(400 / 1.42));
  });

  it("не вигадує число для одиниці без масштабу", () => {
    expect(receiptQtyToBase(1, "уп")).toBeNull();
    expect(receiptQtyToBase(null, "кг")).toBeNull();
    expect(receiptQtyToBase(0, "кг")).toBeNull();
  });
});

// Звіт власника 2026-08-31: дві банки Red Bull 0,25 л показувались у
// розкладі позиції як одна «500 мл» — пляшка, якої людина не купувала.
// Добуток лишається (інваріант суми), кількість штук їде поруч із ним.
describe("receiptPackCount", () => {
  it("2 × 0,25 л → 2, поруч із добутком 500 мл", () => {
    expect(receiptPackCount(2, "0,25л")).toBe(2);
    expect(receiptQtyToBase(2, "0,25л")).toEqual({ qty: 500, unit: "мл" });
  });

  it.each([
    [1, "0,25л", "одна банка — множення не відбувалось"],
    [0.212, "кг", "ваговий товар — одиниця виміру, не фасування"],
    [2, "кг", "чиста одиниця виміру: 2 кг це не «2 × кг»"],
    [null, "0,25л", "кількості немає"],
  ])("%s + '%s' → null (%s)", (qty, unit, _why) => {
    expect(receiptPackCount(qty as number | null, unit as string)).toBeNull();
  });

  it("надпочата покупка втрачає «× N»: 250 мл від двох банок це вже не пара", () => {
    const source = {
      name: "Напій енергетичний Red Bull",
      qty: 500,
      unit: "мл",
      addedAt: "2026-08-31",
      packCount: 2,
    };
    const after = consumeFromSources([source], 250);
    expect(after[0]!.qty).toBe(250);
    expect(after[0]!.packCount).toBeNull();
  });
});

describe("mergeItems із варіантами", () => {
  it("кейс 5: дві покупки молока різних брендів дають ОДНУ позицію з двома варіантами", () => {
    const first = {
      ...fromReceipt("Молоко Яготинське 2.6% 900г", 1, "900мл", "2026-08-21"),
      name: "Молоко",
    };
    const second = {
      ...fromReceipt("Молоко Галичина 1%", 1, "1.1л", "2026-08-28"),
      name: "Молоко",
    };

    const merged = mergeItems([], [first, second]);

    expect(merged).toHaveLength(1);
    const item = merged[0]!;
    expect(item.name).toBe("Молоко");
    expect(item.qty).toBe(2000);
    expect(item.unit).toBe("мл");
    expect(item.sources).toHaveLength(2);
    expect(sourcesTotal(item.sources)).toBe(item.qty);
    expect(pantrySourcesInvariantHolds(item)).toBe(true);
  });

  it("кейс 6: два рядки одного чека з однаковою родовою назвою — одна позиція", () => {
    const a = {
      ...fromReceipt("Молоко Яготинське 2.6%", 1, "900мл", "2026-08-28"),
      name: "Молоко",
    };
    const b = {
      ...fromReceipt("Молоко Галичина 1%", 1, "900мл", "2026-08-28"),
      name: "Молоко",
    };
    const merged = mergeItems([], [a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sources).toHaveLength(2);
  });

  it("кейс 7: маса і обʼєм лишаються двома позиціями, коли щільність невідома", () => {
    const grams = {
      ...fromReceipt("Сир кисломолочний 900г", 1, "900г", "2026-08-21", "Сир"),
      name: "Сир",
    };
    const millis = {
      ...fromReceipt("Сир питний 1л", 1, "1л", "2026-08-21", "Сир"),
      name: "Сир",
    };
    const merged = mergeItems([], [grams, millis]);
    expect(merged).toHaveLength(2);
    expect(merged.map((x) => x.unit)).toEqual(["г", "мл"]);
  });

  // Рішення founder-а 2026-08-29, що уточнює рішення 7 спеки: там, де
  // щільність ВІДОМА, маса й обʼєм сходяться в одну картку. Інакше «Молоко
  // 900 г» із чека і «Молоко 1 л» лишались би двома рядками — тобто фіча
  // не працювала б на продукті, заради якого її писали.
  it("молоко в грамах і в літрах — ОДНА позиція, бо щільність відома", () => {
    const grams = {
      ...fromReceipt(
        "Молоко Яготинське 2.6% 900г",
        1,
        "900г",
        "2026-08-21",
        "Молоко",
      ),
      name: "Молоко",
    };
    const millis = {
      ...fromReceipt("Молоко Галичина 1%", 1, "1л", "2026-08-28", "Молоко"),
      name: "Молоко",
    };
    const merged = mergeItems([], [grams, millis]);
    expect(merged).toHaveLength(1);
    const item = merged[0]!;
    expect(item.unit).toBe("мл");
    // 900 г / 1.03 + 1000 мл = 1874 мл, а НЕ 1900.
    expect(item.qty).toBe(Math.round(900 / 1.03) + 1000);
    expect(item.sources).toHaveLength(2);
    expect(pantrySourcesInvariantHolds(item)).toBe(true);
  });

  it("наявний ручний залишок стає синтетичним варіантом, інваріант тримається", () => {
    const manual: PantryItem = {
      name: "Молоко",
      qty: 1,
      unit: "л",
      notes: null,
    };
    const incoming = {
      ...fromReceipt("Молоко Галичина 1%", 1, "500мл", "2026-08-28"),
      name: "Молоко",
    };
    const merged = mergeItems([manual], [incoming]);
    expect(merged).toHaveLength(1);
    const item = merged[0]!;
    expect(item.qty).toBe(1500);
    expect(item.unit).toBe("мл");
    expect(item.sources).toHaveLength(2);
    expect(item.sources![0]!.addedAt).toBeNull();
    expect(pantrySourcesInvariantHolds(item)).toBe(true);
  });

  it("позиція без варіантів мерджиться як раніше — зручна одиниця зберігається", () => {
    const merged = mergeItems(
      [{ name: "Борошно", qty: 1, unit: "кг", notes: null }],
      [{ name: "борошно", qty: 200, unit: "г", notes: null }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.qty).toBe(1.2);
    expect(merged[0]!.unit).toBe("кг");
    expect(merged[0]!.sources ?? null).toBeNull();
  });
});

describe("capSources (кейс 12)", () => {
  it("не росте понад межу — вичерпані вилітають першими", () => {
    const many = [
      source("Вичерпаний A", 0),
      source("Вичерпаний B", 0),
      ...Array.from({ length: MAX_PANTRY_SOURCES }, (_, i) =>
        source(`Покупка ${i}`, 100),
      ),
    ];
    const capped = capSources(many, "Молоко");
    expect(capped).toHaveLength(MAX_PANTRY_SOURCES);
    expect(capped.every((s) => s.qty > 0)).toBe(true);
  });

  it("без вичерпаних — найстаріші зливаються в один запис родової назви", () => {
    const many = Array.from({ length: MAX_PANTRY_SOURCES + 2 }, (_, i) =>
      source(`Покупка ${i}`, 100),
    );
    const capped = capSources(many, "Молоко");
    expect(capped).toHaveLength(MAX_PANTRY_SOURCES);
    expect(capped[0]!.name).toBe("Молоко");
    expect(capped[0]!.qty).toBe(300);
    // Сума не змінилась — обрізання не має красти кількість.
    expect(sourcesTotal(capped)).toBe(sourcesTotal(many));
  });
});

describe("consumeFromSources + applyConsumeToPantryItem (кейс 10)", () => {
  const item: PantryItem = {
    name: "Молоко",
    qty: 2000,
    unit: "мл",
    notes: null,
    sources: [
      source("Молоко Яготинське 2.6%", 900, "мл", "2026-08-21"),
      source("Молоко Галичина 1%", 1100, "мл", "2026-08-28"),
    ],
  };

  it("списує саме з обраного варіанта і тримає інваріант", () => {
    // 200 г молока ≈ 194.2 мл (густина 1.03) — конверсія лишається в
    // `gramsToUnitQty`, тут перевіряється розподіл між варіантами.
    const res = applyConsumeToPantryItem(item, 200, "Молоко Галичина 1%")!;
    expect(res.item).not.toBeNull();
    const next = res.item!;
    expect(next.sources![0]!.qty).toBe(900);
    expect(next.sources![1]!.qty).toBeLessThan(1100);
    expect(pantrySourcesInvariantHolds(next)).toBe(true);
  });

  it("без вибору списує з найстарішого", () => {
    const res = applyConsumeToPantryItem(item, 200)!;
    const next = res.item!;
    expect(next.sources![0]!.qty).toBeLessThan(900);
    expect(next.sources![1]!.qty).toBe(1100);
  });

  it("вичерпаний варіант зникає, а нестача добирається з наступного", () => {
    const next = consumeFromSources(
      item.sources,
      1000,
      "Молоко Яготинське 2.6%",
    );
    expect(next).toHaveLength(1);
    expect(next[0]!.name).toBe("Молоко Галичина 1%");
    expect(next[0]!.qty).toBe(1000);
  });

  it("позиція зникає, коли варіанти вичерпані повністю", () => {
    const res = applyConsumeToPantryItem(item, 5000)!;
    expect(res.item).toBeNull();
  });

  it("позиція без варіантів списується як раніше", () => {
    const plain: PantryItem = {
      name: "Курка",
      qty: 500,
      unit: "г",
      notes: null,
    };
    const res = applyConsumeToPantryItem(plain, 200)!;
    expect(res.item!.qty).toBe(300);
    expect(res.item!.sources ?? null).toBeNull();
  });
});

describe("інваріант суми", () => {
  it("ловить розходження кількості й варіантів", () => {
    expect(
      pantrySourcesInvariantHolds({
        name: "Молоко",
        qty: 1500,
        unit: "мл",
        notes: null,
        sources: [source("A", 900), source("B", 1100)],
      }),
    ).toBe(false);
  });

  it("порівнює в базовій одиниці, а не в написаній", () => {
    expect(
      pantrySourcesInvariantHolds({
        name: "Борошно",
        qty: 1.2,
        unit: "кг",
        notes: null,
        sources: [source("A", 1000, "г"), source("B", 200, "г")],
      }),
    ).toBe(true);
  });

  it("позиція без варіантів інваріант не порушує", () => {
    expect(
      pantrySourcesInvariantHolds({
        name: "Сіль",
        qty: null,
        unit: null,
        notes: null,
      }),
    ).toBe(true);
  });

  it("синтетичний варіант дорівнює залишку позиції", () => {
    const s = syntheticSource({ name: "Молоко", qty: 1, unit: "л" })!;
    expect(s).toEqual({
      name: "Молоко",
      qty: 1000,
      unit: "мл",
      addedAt: null,
    });
  });
});

describe("повторний імпорт (кейс 11)", () => {
  it("той самий чек, підтверджений двічі, не подвоює кількість", () => {
    const receiptLine = {
      ...fromReceipt("Молоко Яготинське 2.6% 900г", 1, "900мл", "2026-08-28"),
      name: "Молоко",
    };

    const once = mergeItems([], [receiptLine]);
    const twice = mergeItems(once, [receiptLine]);

    expect(twice).toHaveLength(1);
    expect(twice[0]!.qty).toBe(900);
    expect(twice[0]!.sources).toHaveLength(1);
    expect(pantrySourcesInvariantHolds(twice[0]!)).toBe(true);
  });

  it("та сама покупка іншого дня — це нова покупка", () => {
    const week1 = {
      ...fromReceipt("Молоко Яготинське 2.6% 900г", 1, "900мл", "2026-08-21"),
      name: "Молоко",
    };
    const week2 = {
      ...fromReceipt("Молоко Яготинське 2.6% 900г", 1, "900мл", "2026-08-28"),
      name: "Молоко",
    };
    const merged = mergeItems(mergeItems([], [week1]), [week2]);
    expect(merged[0]!.qty).toBe(1800);
    expect(merged[0]!.sources).toHaveLength(2);
  });
});

describe("ручне доливання до позиції з варіантами", () => {
  it("не губить кількість — стає ще одним варіантом", () => {
    const fromChek = {
      ...fromReceipt("Молоко Яготинське 2.6% 900г", 1, "900мл", "2026-08-28"),
      name: "Молоко",
    };
    const withVariants = mergeItems([], [fromChek]);

    // Рядок, набраний руками: варіантів не несе взагалі.
    const merged = mergeItems(withVariants, [
      { name: "молоко", qty: 200, unit: "мл", notes: null },
    ]);

    expect(merged).toHaveLength(1);
    const item = merged[0]!;
    expect(item.qty).toBe(1100);
    expect(item.sources).toHaveLength(2);
    expect(item.sources![1]!.addedAt).toBeNull();
    expect(pantrySourcesInvariantHolds(item)).toBe(true);
  });
});
