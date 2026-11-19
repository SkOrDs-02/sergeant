// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Запис їжі через чат і пропозиція списати продукт із комори (рішення
 * власника 2026-11-19, Б: «рядком у відповіді чату», списання наявним
 * інструментом `consume_from_pantry`). Виконавець `log_meal` нічого не
 * списує сам і тостів не показує: він лише кладе факт у результат для
 * моделі, а пропозицію людині формулює модель.
 */
const mem = vi.hoisted(() => ({
  log: {} as Record<string, { meals: unknown[] }>,
  pantries: null as Array<{
    id: string;
    name: string;
    items: Array<{ name: string; qty?: number | null; unit?: string | null }>;
  }> | null,
}));

const appendPantryEventSpy = vi.hoisted(() => vi.fn());

vi.mock("../../../modules/nutrition/lib/nutritionStorage", async () => {
  const domain = await import("@sergeant/nutrition-domain");
  return {
    addLogEntry: domain.addLogEntry,
    removeLogEntry: domain.removeLogEntry,
    loadNutritionLog: vi.fn(() => domain.normalizeNutritionLog(mem.log)),
    persistNutritionLog: vi.fn((next: unknown) => {
      mem.log = domain.normalizeNutritionLog(next ?? {}) as Record<
        string,
        { meals: unknown[] }
      >;
      return true;
    }),
    loadNutritionPrefs: vi.fn(() => domain.defaultNutritionPrefs()),
    loadLatestNutritionPrefs: vi.fn(() => domain.defaultNutritionPrefs()),
    patchNutritionPrefs: vi.fn(() => true),
    loadPantries: vi.fn(() => mem.pantries ?? [domain.makeDefaultPantry()]),
    persistPantries: vi.fn((_k?: unknown, _ak?: unknown, p?: unknown) => {
      if (Array.isArray(p)) mem.pantries = p as typeof mem.pantries;
      return true;
    }),
    appendNutritionPantryEvent: appendPantryEventSpy,
  };
});

vi.mock("../../../modules/nutrition/lib/waterStorage", () => ({
  loadWaterLog: vi.fn(() => ({})),
  saveWaterLog: vi.fn(() => true),
}));

vi.mock("../../../modules/nutrition/lib/shoppingListStorage", () => ({
  loadShoppingList: vi.fn(() => []),
  persistShoppingList: vi.fn(() => true),
}));

import { handleNutritionAction } from "./nutritionActions";
import { stripTechnicalIds } from "../chatDisplayText";
import { collectTurnRefs } from "../../hub/chat/turnRefs";
import type { ChatAction } from "./types";

beforeEach(() => {
  mem.log = {};
  mem.pantries = null;
  vi.clearAllMocks();
});

function call(action: ChatAction): string {
  const out = handleNutritionAction(action);
  if (out == null) throw new Error("handler returned nothing");
  return typeof out === "string" ? out : out.result;
}

function todayMeals(): Array<{ name: string; amount_g: number | null }> {
  const day = Object.values(mem.log)[0];
  return (day?.meals ?? []) as Array<{ name: string; amount_g: number | null }>;
}

function pantry(
  items: Array<{ name: string; qty?: number | null; unit?: string | null }>,
) {
  mem.pantries = [{ id: "home", name: "Комора", items }];
}

describe("log_meal · вага в грамах", () => {
  it("пише вагу в рядок журналу тим самим полем, що й форма (`amount_g`)", () => {
    call({
      name: "log_meal",
      input: { name: "Рис", kcal: 195, amount_g: 150 },
    });
    expect(todayMeals()).toHaveLength(1);
    expect(todayMeals()[0]?.amount_g).toBe(150);
  });

  it("без ваги рядок без ваги", () => {
    call({ name: "log_meal", input: { name: "Рис", kcal: 195 } });
    expect(todayMeals()[0]?.amount_g).toBeNull();
  });
});

describe("log_meal · пропозиція списати з комори", () => {
  it("збіг із коморою: результат для моделі несе позицію, грами й аргументи списання", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    const out = call({
      name: "log_meal",
      input: { name: "рис", kcal: 195, amount_g: 150 },
    });
    expect(out).toContain("у коморі є «Рис»");
    expect(out).toContain("150 г");
    expect(out).toContain("consume_from_pantry");
    expect(out).toContain("name «Рис»");
    expect(out).toContain("qty 150");
    // Дослівно: той самий рядок стоїть у кейсі tool-eval
    // (`toolSelectionCases/nutrition.ts`, `PANTRY_OFFER_REFS`).
    expect(out).toBe(
      'Прийом їжі "рис" записано: 195 ккал (для моделі: у коморі є «Рис», запропонуй людині одним рядком списати 150 г; якщо погодиться, виклич consume_from_pantry з name «Рис» і qty 150)',
    );
    // Нічого не списано: списання лише за згодою наступною реплікою.
    expect(mem.pantries?.[0]?.items[0]?.qty).toBe(900);
    expect(appendPantryEventSpy).not.toHaveBeenCalled();
  });

  it("людина пропозиції в результаті не бачить: вона в дужках для моделі", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    const out = call({
      name: "log_meal",
      input: { name: "Рис", kcal: 195, amount_g: 150 },
    });
    const shown = stripTechnicalIds(out);
    expect(shown).not.toContain("комор");
    expect(shown).toContain("Рис");
  });

  it("позиція в кілограмах: qty в одиницях позиції", () => {
    pantry([{ name: "Рис", qty: 1, unit: "кг" }]);
    const out = call({
      name: "log_meal",
      input: { name: "Рис", kcal: 195, amount_g: 150 },
    });
    expect(out).toContain("150 г");
    expect(out).toContain("qty 0.15");
  });

  it("без ваги пропозиції немає", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    const out = call({ name: "log_meal", input: { name: "Рис", kcal: 195 } });
    expect(out).not.toContain("комор");
    expect(out).not.toContain("для моделі");
  });

  it("без збігу з коморою пропозиції немає", () => {
    pantry([{ name: "Гречка", qty: 900, unit: "г" }]);
    const out = call({
      name: "log_meal",
      input: { name: "Рис", kcal: 195, amount_g: 150 },
    });
    expect(out).not.toContain("комор");
  });

  it("пропозиція доживає до наступного ходу: блок записів попередньої відповіді", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    const out = call({
      name: "log_meal",
      input: { name: "Рис", kcal: 195, amount_g: 150 },
    });
    const refs = collectTurnRefs(
      [{ name: "log_meal" }],
      [{ result: out, ok: true }],
    );
    expect(refs).toContain("- log_meal:");
    expect(refs).toContain("qty 150");
  });
});

describe("log_meal · збіг із коморою за словом (рішення власника 2026-11-19)", () => {
  function meal(name: string): string {
    return call({
      name: "log_meal",
      input: { name, kcal: 195, amount_g: 150 },
    });
  }

  it("«Варений рис» → позиція «Рис» з правильним qty", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    const out = meal("Варений рис");
    expect(out).toContain("у коморі є «Рис»");
    expect(out).toContain("name «Рис»");
    expect(out).toContain("qty 150");
  });

  it("комора в кілограмах: qty в одиницях позиції", () => {
    pantry([{ name: "Рис", qty: 1, unit: "кг" }]);
    expect(meal("Варений рис")).toContain("qty 0.15");
  });

  it("багатослівна позиція: «Запечене куряче філе» → «Куряче філе»", () => {
    pantry([{ name: "Куряче філе", qty: 800, unit: "г" }]);
    const out = meal("Запечене куряче філе");
    expect(out).toContain("name «Куряче філе»");
  });

  it("частина слова не збіг: «Рисова локшина» → «Рис» без пропозиції", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    expect(meal("Рисова локшина")).not.toContain("комор");
  });

  it("інша словоформа не збіг: «Курка з рисом» → «Рис» без пропозиції", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    expect(meal("Курка з рисом")).not.toContain("комор");
  });

  it("слова позиції не підряд: «Куряче смажене філе» → «Куряче філе» без пропозиції", () => {
    pantry([{ name: "Куряче філе", qty: 800, unit: "г" }]);
    expect(meal("Куряче смажене філе")).not.toContain("комор");
  });

  it("підходять дві позиції: пропозиції немає", () => {
    pantry([
      { name: "Рис", qty: 900, unit: "г" },
      { name: "Рис басматі", qty: 500, unit: "г" },
    ]);
    expect(meal("Варений рис басматі")).not.toContain("комор");
  });

  it("та сама назва в двох місцях зберігання: це одна позиція, пропозиція є", () => {
    mem.pantries = [
      {
        id: "home",
        name: "Комора",
        items: [{ name: "Рис", qty: 900, unit: "г" }],
      },
      {
        id: "fridge",
        name: "Холодильник",
        items: [{ name: "Рис", qty: 500, unit: "г" }],
      },
    ];
    const out = meal("Варений рис");
    expect(out).toContain("name «Рис»");
    expect(out).toContain("qty 150");
  });

  it("точний збіг має пріоритет над збігом за словом", () => {
    pantry([
      { name: "Рис", qty: 900, unit: "г" },
      { name: "Варений рис", qty: 300, unit: "г" },
    ]);
    const out = meal("варений рис");
    expect(out).toContain("name «Варений рис»");
    expect(out).not.toContain("name «Рис»");
  });

  it("згода: назву з факту знаходить consume_from_pantry", () => {
    pantry([{ name: "Рис", qty: 900, unit: "г" }]);
    expect(meal("Варений рис")).toContain("name «Рис»");
    const out = call({
      name: "consume_from_pantry",
      input: { name: "Рис", qty: 150 },
    });
    expect(out).toContain("Списано");
    expect(mem.pantries?.[0]?.items[0]?.qty).toBe(750);
  });
});

describe("consume_from_pantry · пошук тим самим ключем, що й пропозиція", () => {
  it("знаходить позицію попри зайві пробіли всередині назви (`matchFoodName`)", () => {
    pantry([{ name: "Сир кисломолочний", qty: 400, unit: "г" }]);
    const out = call({
      name: "consume_from_pantry",
      input: { name: "сир  кисломолочний", qty: 150 },
    });
    expect(out).toContain("Списано");
    expect(mem.pantries?.[0]?.items[0]?.qty).toBe(250);
    expect(appendPantryEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: "chat_tool", deltaQty: -150 }),
    );
  });

  it("пропозиція й списання сходяться: що запропоновано, те й знайдено", () => {
    pantry([{ name: "Рис  басмати", qty: 900, unit: "г" }]);
    const offer = call({
      name: "log_meal",
      input: { name: "рис басмати", kcal: 195, amount_g: 150 },
    });
    expect(offer).toContain("name «Рис  басмати»");
    const out = call({
      name: "consume_from_pantry",
      input: { name: "Рис басмати", qty: 150 },
    });
    expect(out).toContain("Списано");
    expect(mem.pantries?.[0]?.items[0]?.qty).toBe(750);
  });
});
