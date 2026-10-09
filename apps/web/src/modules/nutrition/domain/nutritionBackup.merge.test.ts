/**
 * Аудит 2026-10-01, data-06: Hub-імпорт у режимі `merge` («лише додати
 * відсутнє») не має породжувати жодного `delete` у dual-write (а отже й
 * tombstone-ів на сервері), а `replace` лишається явною заміною.
 *
 * Тест мокає тригер dual-write і рахує різницю `prev → next`, яку той отримав:
 * це саме те, що пішло б у SQLite і в outbox.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerSpy = vi.fn();

vi.mock("../lib/sqliteWriter/index", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/sqliteWriter/index")
  >("../lib/sqliteWriter/index");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
    isNutritionDualWriteRegistered: () => true,
  };
});

import { __setNutritionSqliteCacheForTests } from "../lib/sqliteReader";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
} from "../lib/sqliteWriter/diff";
import {
  applyNutritionBackupPayload,
  NUTRITION_BACKUP_KIND,
} from "./nutritionBackup";

const meal = (id: string, name: string) => ({
  id,
  name,
  time: "08:00",
  mealType: "breakfast",
  label: "",
  macros: { kcal: 100, protein_g: 1, fat_g: 1, carbs_g: 1 },
  source: "manual",
  macroSource: "manual",
});

function payload(data: Record<string, unknown>) {
  return {
    kind: NUTRITION_BACKUP_KIND,
    schemaVersion: 1,
    exportedAt: "2026-10-01T00:00:00.000Z",
    data: { stateSchemaVersion: 1, prefs: {}, ...data },
  };
}

/** Усі ops, які тригер отримав за час apply. */
function emittedKinds(): string[] {
  const kinds: string[] = [];
  for (const [prev, next] of triggerSpy.mock.calls as Array<
    [NutritionDualWriteState, NutritionDualWriteState]
  >) {
    for (const op of diffNutritionDualWriteOps(prev, next)) kinds.push(op.kind);
  }
  return kinds;
}

beforeEach(() => {
  triggerSpy.mockReset();
  __setNutritionSqliteCacheForTests({
    pantries: [
      {
        id: "home",
        name: "Дім",
        text: "яйця",
        items: [{ name: "яйця", qty: null, unit: null, notes: null }],
      },
      { id: "dacha", name: "Дача", text: "", items: [] },
    ] as never,
    activePantryId: "home",
    log: { "2026-09-01": { meals: [meal("m-now", "Поточний")] } } as never,
  });
});

const FILE = payload({
  pantries: [
    {
      id: "home",
      name: "Дім",
      text: "сир",
      items: [{ name: "сир", qty: null, unit: null, notes: null }],
    },
    { id: "extra", name: "Нова", text: "", items: [] },
  ],
  activePantryId: "extra",
  log: {
    "2026-09-01": { meals: [meal("m-file", "З файлу")] },
    "2026-09-02": { meals: [meal("m-day2", "Другий день")] },
  },
});

describe("applyNutritionBackupPayload — режими відновлення", () => {
  it("merge: жодного delete, поточне лишається, нове додається", async () => {
    await applyNutritionBackupPayload(FILE, "merge");

    const kinds = emittedKinds();
    expect(kinds).not.toContain("meal-delete");
    expect(kinds).not.toContain("pantry-delete");
    expect(kinds.filter((k) => k === "meal-upsert").length).toBe(2);
    expect(kinds).toContain("pantry-upsert");

    // Підсумковий стан: старий прийом лишився, файлові додались.
    const last = triggerSpy.mock.calls.at(-1) as [
      NutritionDualWriteState,
      NutritionDualWriteState,
    ];
    const mealIds = last[1].meals.map((m) => m.id).sort();
    expect(mealIds).toEqual(["m-day2", "m-file", "m-now"]);
  });

  it("merge: непорожня комора лишається такою, яка є, а активна комора не змінюється", async () => {
    await applyNutritionBackupPayload(FILE, "merge");
    const pantryCall = triggerSpy.mock.calls[0] as [
      NutritionDualWriteState,
      NutritionDualWriteState,
    ];
    const home = pantryCall[1].pantries.find((p) => p.id === "home");
    expect(JSON.stringify(home)).toContain("яйця");
    expect(JSON.stringify(home)).not.toContain("сир");
    expect(pantryCall[1].prefs?.activePantryId).toBe("home");
  });

  it("merge: порожню комору (наприклад свіжу home) файл заповнює", async () => {
    __setNutritionSqliteCacheForTests({
      pantries: [{ id: "home", name: "Дім", text: "", items: [] }] as never,
      activePantryId: "home",
    });
    await applyNutritionBackupPayload(FILE, "merge");
    const pantryCall = triggerSpy.mock.calls[0] as [
      NutritionDualWriteState,
      NutritionDualWriteState,
    ];
    const home = pantryCall[1].pantries.find((p) => p.id === "home");
    expect(JSON.stringify(home)).toContain("сир");
  });

  it("replace (явний вибір): прибирає те, чого немає у файлі", async () => {
    await applyNutritionBackupPayload(FILE, "replace");
    const kinds = emittedKinds();
    expect(kinds).toContain("meal-delete");
    expect(kinds).toContain("pantry-delete");
  });
});
