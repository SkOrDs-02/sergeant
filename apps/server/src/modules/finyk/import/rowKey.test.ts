import { describe, expect, it } from "vitest";
import {
  assignImportRowIds,
  buildImportRowId,
  computeOccurrenceIndices,
  normalizeDescriptionForRowKey,
} from "./rowKey.js";

const BASE = {
  date: "2026-01-15",
  amountKopiykas: 10000,
  direction: "expense" as const,
  description: "Сільпо",
};

describe("normalizeDescriptionForRowKey", () => {
  it("trim + lowercase", () => {
    expect(normalizeDescriptionForRowKey("  Сільпо  ")).toBe("сільпо");
  });

  it("згортає внутрішні пробіли до одного", () => {
    expect(normalizeDescriptionForRowKey("ТОВ   Сільпо-Фуд")).toBe(
      "тов сільпо-фуд",
    );
  });

  it("однакові за суттю рядки нормалізуються до того самого значення", () => {
    expect(normalizeDescriptionForRowKey("Сільпо")).toBe(
      normalizeDescriptionForRowKey("  сільпо  "),
    );
  });
});

describe("buildImportRowId", () => {
  it("починається з префіксу 'imp1:'", () => {
    const id = buildImportRowId({ userId: "u1", occurrenceIndex: 0, ...BASE });
    expect(id.startsWith("imp1:")).toBe(true);
  });

  it("детермінований — той самий вхід завжди дає той самий id", () => {
    const id1 = buildImportRowId({ userId: "u1", occurrenceIndex: 0, ...BASE });
    const id2 = buildImportRowId({ userId: "u1", occurrenceIndex: 0, ...BASE });
    expect(id1).toBe(id2);
  });

  it("детермінізм між двома НЕЗАЛЕЖНИМИ викликами (симулює 2 upload-и того самого файлу)", () => {
    // 0022 інваріант: той самий вхідний період → той самий набір ключів.
    const call1 = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 2,
      ...BASE,
    });
    const call2 = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 2,
      ...BASE,
    });
    expect(call1).toBe(call2);
  });

  it("різний userId → різний id (ізоляція між користувачами)", () => {
    const id1 = buildImportRowId({ userId: "u1", occurrenceIndex: 0, ...BASE });
    const id2 = buildImportRowId({ userId: "u2", occurrenceIndex: 0, ...BASE });
    expect(id1).not.toBe(id2);
  });

  it("різний occurrenceIndex → різний id", () => {
    const id0 = buildImportRowId({ userId: "u1", occurrenceIndex: 0, ...BASE });
    const id1 = buildImportRowId({ userId: "u1", occurrenceIndex: 1, ...BASE });
    expect(id0).not.toBe(id1);
  });

  it("різний direction → різний id (той самий amount, протилежний напрям)", () => {
    const expense = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 0,
      ...BASE,
      direction: "expense",
    });
    const income = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 0,
      ...BASE,
      direction: "income",
    });
    expect(expense).not.toBe(income);
  });

  it("нормалізація опису: 'Сільпо' і '  сільпо  ' дають той самий id", () => {
    const id1 = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 0,
      ...BASE,
      description: "Сільпо",
    });
    const id2 = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 0,
      ...BASE,
      description: "  сільпо  ",
    });
    expect(id1).toBe(id2);
  });

  it("різний опис (не лише форматування) → різний id", () => {
    const id1 = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 0,
      ...BASE,
      description: "Сільпо",
    });
    const id2 = buildImportRowId({
      userId: "u1",
      occurrenceIndex: 0,
      ...BASE,
      description: "АТБ",
    });
    expect(id1).not.toBe(id2);
  });
});

describe("computeOccurrenceIndices", () => {
  it("унікальні рядки всі отримують occurrenceIndex:0", () => {
    const rows = [
      { ...BASE, description: "А" },
      { ...BASE, description: "Б" },
      { ...BASE, description: "В" },
    ];
    expect(computeOccurrenceIndices(rows)).toEqual([0, 0, 0]);
  });

  it("два однакові рядки (same date/amount/direction/description) отримують 0 і 1", () => {
    const rows = [BASE, BASE];
    expect(computeOccurrenceIndices(rows)).toEqual([0, 1]);
  });

  it("три однакові рядки → 0, 1, 2", () => {
    const rows = [BASE, BASE, BASE];
    expect(computeOccurrenceIndices(rows)).toEqual([0, 1, 2]);
  });

  it("групи не заважають одна одній (interleaved)", () => {
    const a = { ...BASE, description: "А" };
    const b = { ...BASE, description: "Б" };
    // a, b, a, a, b → очікуємо a:[0,1,2], b:[0,1]
    const rows = [a, b, a, a, b];
    expect(computeOccurrenceIndices(rows)).toEqual([0, 0, 1, 2, 1]);
  });

  it("нормалізація опису групує 'Сільпо' і 'сільпо' разом", () => {
    const rows = [
      { ...BASE, description: "Сільпо" },
      { ...BASE, description: "сільпо" },
    ];
    expect(computeOccurrenceIndices(rows)).toEqual([0, 1]);
  });
});

describe("assignImportRowIds", () => {
  it("повертає масив тієї самої довжини й порядку, що rows", () => {
    const rows = [
      { ...BASE, description: "А" },
      { ...BASE, description: "Б" },
    ];
    const ids = assignImportRowIds("u1", rows);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("два легітимно однакові платежі в один день → 2 РІЗНІ id (не 1)", () => {
    // Ключовий acceptance-кейс спеки § Фаза 2 «Дедуп»: "дві кави по 85 грн
    // в один день" не повинні злипнутись в один рядок.
    const rows = [BASE, BASE];
    const ids = assignImportRowIds("u1", rows);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("детермінізм на рівні всього батчу: той самий масив rows двічі → той самий набір id", () => {
    const rows = [
      { ...BASE, description: "А" },
      BASE,
      BASE,
      { ...BASE, description: "Б" },
    ];
    const ids1 = assignImportRowIds("u1", rows);
    const ids2 = assignImportRowIds("u1", rows);
    expect(ids1).toEqual(ids2);
  });

  it("частковий пере-імпорт (підмножина в тому самому порядку) дає той самий id для спільних рядків", () => {
    // "той самий вхідний період → той самий набір ключів" — тут спрощено
    // до: ті самі перші N рядків у тому самому відносному порядку дають
    // ті самі id, незалежно від хвоста масиву.
    const full = [BASE, BASE, { ...BASE, description: "інше" }];
    const partial = [BASE, BASE];
    const idsFull = assignImportRowIds("u1", full);
    const idsPartial = assignImportRowIds("u1", partial);
    expect(idsFull.slice(0, 2)).toEqual(idsPartial);
  });
});
