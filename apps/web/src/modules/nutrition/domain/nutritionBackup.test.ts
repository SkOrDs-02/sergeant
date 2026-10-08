/**
 * Stage 8 PR #057n-tombstone — backup apply no longer writes to LS;
 * `persist*` from `../lib/nutritionStorage` now fires
 * `triggerNutritionDualWrite`. The test mocks the dual-write trigger
 * and verifies it receives the restored payload.
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

import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../../../core/syncEngine/initialPullState";
import {
  __setNutritionSqliteCacheForTests,
  getCachedNutritionSqliteState,
} from "../lib/sqliteReader";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
} from "../lib/sqliteWriter/diff";
import { loadShoppingList } from "../lib/shoppingListStorage";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
  NUTRITION_BACKUP_KIND,
  NUTRITION_BACKUP_SCHEMA_VERSION,
} from "./nutritionBackup";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string): string | null =>
      store.has(String(k)) ? (store.get(String(k)) ?? null) : null,
    setItem: (k: string, v: string): void =>
      void store.set(String(k), String(v)),
    removeItem: (k: string): void => void store.delete(String(k)),
    clear: (): void => void store.clear(),
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock() as Storage;
  triggerSpy.mockReset();
});

describe("nutrition backup", () => {
  it("builds stable payload with defaults", () => {
    const p = buildNutritionBackupPayload();
    expect(p.kind).toBe(NUTRITION_BACKUP_KIND);
    expect(p.data.pantries).toBeInstanceOf(Array);
    expect(p.data.prefs).toBeTruthy();
  });

  it("apply dispatches dual-write ops for pantries + prefs", () => {
    void applyNutritionBackupPayload({
      kind: NUTRITION_BACKUP_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        stateSchemaVersion: 1,
        pantries: [
          { id: "home", name: "Дім", text: "яйця", items: [{ name: "яйця" }] },
        ],
        activePantryId: "home",
        prefs: { goal: "balanced", servings: 2, timeMinutes: 10, exclude: "" },
      },
    });
    // persistPantries → 1 trigger, persistNutritionPrefs → 1 trigger
    // (no log payload supplied → no third trigger)
    expect(triggerSpy).toHaveBeenCalledTimes(2);
  });

  it("apply also persists log when a valid object is supplied", () => {
    void applyNutritionBackupPayload({
      kind: NUTRITION_BACKUP_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        stateSchemaVersion: 1,
        pantries: [],
        activePantryId: "home",
        prefs: {},
        log: { "2025-01-01": { meals: [] } },
      },
    });
    expect(triggerSpy).toHaveBeenCalledTimes(3);
  });

  it("normalizes pantries by dropping blank items and minting ids", () => {
    const p = buildNutritionBackupPayload();
    void applyNutritionBackupPayload({
      kind: NUTRITION_BACKUP_KIND,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        stateSchemaVersion: 1,
        pantries: [
          {
            name: "Без id",
            text: "",
            items: [{ name: "  " }, { name: "Сир", qty: "2", unit: " кг " }],
          },
        ],
        activePantryId: "",
        prefs: {
          goal: "",
          servings: "x",
          dailyTargetKcal: -5,
          reminderHour: 99,
          waterGoalMl: -100,
        },
        log: [],
      },
    });
    expect(p.data.activePantryId).toBeTruthy();
    expect(triggerSpy).toHaveBeenCalled();
  });

  it.each([
    [null, "Некоректний бекап харчування."],
    [{ kind: "other" }, "Некоректний тип бекапу харчування."],
    [
      { kind: NUTRITION_BACKUP_KIND, schemaVersion: "1" },
      "Некоректна версія схеми бекапу харчування.",
    ],
    [
      { kind: NUTRITION_BACKUP_KIND, schemaVersion: 1, data: null },
      "Некоректні дані бекапу харчування.",
    ],
  ])("apply rejects invalid payload %#", (payload, message) => {
    expect(() => void applyNutritionBackupPayload(payload)).toThrow(message);
    expect(triggerSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Аудит 2026-10-01, data-35: повнота резервної копії Їжі.
//
// `triggerSpy` лише записує виклики, тож цим тестам потрібен «пристрій»:
// редʼюсер нижче переносить кожен перехід `prev → next` у кеш SQLite так, як
// це зробив би dual-write + refresh. Експорт читає кеш пристрою A, імпорт іде
// в кеш пристрою B, і порівнюється те, що B прочитає назад.
// ─────────────────────────────────────────────────────────────────────────

function reduceIntoCache(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
) {
  const patch: Record<string, unknown> = {};
  if (next.pantries !== prev.pantries) {
    patch["pantries"] = next.pantries.map((p) => ({
      id: p.id,
      name: p.name,
      text: p.text,
      items: p.items.map((it) => ({
        name: it.name,
        qty: it.qty,
        unit: it.unit,
        notes: it.notes,
        sources: it.sources ? JSON.parse(it.sources) : null,
      })),
    }));
  }
  if (next.recipes !== prev.recipes) {
    patch["recipes"] = next.recipes.map((r) => JSON.parse(r.dataJson));
  }
  if (next.waterLog !== prev.waterLog) patch["waterLog"] = next.waterLog;
  if (next.shoppingList !== prev.shoppingList) {
    patch["shoppingList"] = next.shoppingList
      ? JSON.parse(next.shoppingList.dataJson)
      : null;
  }
  if (next.goalPeriodRestores?.length) {
    patch["goalPeriods"] = [
      ...getCachedNutritionSqliteState().goalPeriods,
      ...next.goalPeriodRestores.map((p) => ({
        id: p.id,
        effectiveFrom: p.effectiveFrom,
        ...p.goal,
        origin: p.origin,
        createdAt: p.createdAt,
        deletedAt: null,
      })),
    ];
  }
  __setNutritionSqliteCacheForTests({
    ...getCachedNutritionSqliteState(),
    ...patch,
  });
}

function allOps() {
  return (
    triggerSpy.mock.calls as Array<
      [NutritionDualWriteState, NutritionDualWriteState]
    >
  ).flatMap(([prev, next]) => diffNutritionDualWriteOps(prev, next));
}

const allOpKinds = (): string[] => allOps().map((op) => op.kind);

/** Файл так, як він доїжджає з диска: через JSON. */
const viaFile = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const SOURCES = [
  {
    name: "Молоко Яготинське 2.6% 900г",
    qty: 900,
    unit: "мл",
    addedAt: "2026-09-30",
    packCount: null,
    packGrams: 930,
  },
  {
    name: "Молоко Галичина 300мл",
    qty: 600,
    unit: "мл",
    addedAt: null,
    packCount: 2,
  },
];

const MILK_PANTRY = [
  {
    id: "home",
    name: "Дім",
    text: "",
    items: [
      { name: "Молоко", qty: 1500, unit: "мл", notes: null, sources: SOURCES },
    ],
  },
];

const RECIPE = {
  id: "rcp_1",
  title: "Борщ",
  timeMinutes: 90,
  servings: 4,
  ingredients: ["буряк", "капуста"],
  steps: ["зварити"],
  tips: [],
  macros: { kcal: 320, protein_g: 12, fat_g: 9, carbs_g: 41 },
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_100_000_000,
};

const SHOPPING = {
  categories: [
    {
      name: "Інше",
      items: [
        {
          id: "si_1",
          name: "Хліб",
          quantity: "2",
          note: "",
          checked: true,
          source: "manual",
        },
      ],
    },
  ],
};

const PERIOD = {
  id: "gp::2026-03-01::2200:-:-:-:2500::dev-A",
  effectiveFrom: "2026-03-01",
  kcal: 2200,
  proteinG: null,
  fatG: null,
  carbsG: null,
  waterMl: 2500,
  origin: "tdee" as const,
  createdAt: "2026-03-01T08:00:00.000Z",
};

function v2File(data: Record<string, unknown>) {
  return viaFile({
    kind: NUTRITION_BACKUP_KIND,
    schemaVersion: 2,
    exportedAt: "2026-10-08T00:00:00.000Z",
    data: { stateSchemaVersion: 1, pantries: [], prefs: {}, ...data },
  });
}

describe("nutrition backup — повнота (data-35)", () => {
  beforeEach(() => {
    __resetInitialPullStateForTests();
    markInitialPullComplete("user-1", {});
    triggerSpy.mockImplementation(reduceIntoCache);
  });

  it("експорт v2 несе sources позицій комори і нові секції", () => {
    __setNutritionSqliteCacheForTests({
      pantries: MILK_PANTRY as never,
      recipes: [RECIPE] as never,
      waterLog: { "2026-09-01": 1500 },
      shoppingList: SHOPPING as never,
      goalPeriods: [
        { ...PERIOD, deletedAt: null },
        { ...PERIOD, id: "gp::retracted", deletedAt: "2026-03-02T00:00:00Z" },
      ] as never,
    });
    const p = buildNutritionBackupPayload();
    expect(p.schemaVersion).toBe(NUTRITION_BACKUP_SCHEMA_VERSION);
    expect(NUTRITION_BACKUP_SCHEMA_VERSION).toBe(2);
    expect(p.data.pantries[0]!.items[0]!.sources).toEqual(SOURCES);
    expect(p.data.recipes).toEqual([RECIPE]);
    expect(p.data.waterLog).toEqual({ "2026-09-01": 1500 });
    // Ретрактована сходинка у файл не потрапляє.
    expect(p.data.goalPeriods).toEqual([PERIOD]);
  });

  it("холодний кеш не дає секцій, які стерли б дані при replace", () => {
    __setNutritionSqliteCacheForTests({ refreshedAt: null });
    const { data } = buildNutritionBackupPayload();
    expect(data.recipes).toBeUndefined();
    expect(data.shoppingList).toBeUndefined();
    expect(data.waterLog).toBeUndefined();
    expect(data.goalPeriods).toBeUndefined();
  });

  it("round-trip export → import (replace) лишає sources байт-у-байт", async () => {
    __setNutritionSqliteCacheForTests({ pantries: MILK_PANTRY as never });
    const file = viaFile(buildNutritionBackupPayload());
    await applyNutritionBackupPayload(file, "replace");

    const restored = getCachedNutritionSqliteState().pantries[0]!.items[0]!;
    expect(JSON.stringify(restored.sources)).toBe(JSON.stringify(SOURCES));
    // До dual-write пішла позиція з історією покупок, а не з `sources: null`.
    const pantryUpsert = allOps().find((op) => op.kind === "pantry-upsert");
    expect(JSON.stringify(pantryUpsert)).toContain("Яготинське");
  });

  it("позиція з невалідними sources виходить БЕЗ ключа sources, а не з null", () => {
    __setNutritionSqliteCacheForTests({
      pantries: [
        {
          id: "home",
          name: "Дім",
          text: "",
          items: [
            {
              name: "Молоко",
              qty: 1,
              unit: "л",
              notes: null,
              sources: [{ name: "x", qty: -5, unit: "г", addedAt: null }],
            },
            {
              name: "Сир",
              qty: 1,
              unit: "кг",
              notes: null,
              sources: [{ name: "Сир", qty: 1, unit: "кг", addedAt: 5 }],
            },
          ],
        },
      ] as never,
    });
    const items = buildNutritionBackupPayload().data.pantries[0]!.items;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect("sources" in item).toBe(false);
    }
  });

  it("round-trip по всіх секціях відновлює той самий стан на порожньому пристрої", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [RECIPE] as never,
      waterLog: { "2026-09-01": 1500, "2026-09-02": 800 },
      shoppingList: SHOPPING as never,
      goalPeriods: [{ ...PERIOD, deletedAt: null }] as never,
    });
    const shoppingBefore = loadShoppingList();
    const file = viaFile(buildNutritionBackupPayload());

    // Пристрій B: прогрітий, але порожній.
    __setNutritionSqliteCacheForTests({});
    triggerSpy.mockClear();
    await applyNutritionBackupPayload(file, "replace");

    const after = getCachedNutritionSqliteState();
    expect(after.recipes).toEqual([RECIPE]);
    expect(after.waterLog).toEqual({ "2026-09-01": 1500, "2026-09-02": 800 });
    expect(loadShoppingList()).toEqual(shoppingBefore);
    expect(after.goalPeriods).toEqual([{ ...PERIOD, deletedAt: null }]);
    expect(allOpKinds()).toEqual(
      expect.arrayContaining([
        "recipe-upsert",
        "water-log-set",
        "shopping-list-set",
        "goal-period-restore",
      ]),
    );
  });

  it("replace: рецепти й вода, яких немає в секції файлу, видаляються", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [RECIPE, { ...RECIPE, id: "rcp_old", title: "Старий" }] as never,
      waterLog: { "2026-08-01": 100 },
    });
    await applyNutritionBackupPayload(
      v2File({ recipes: [RECIPE], waterLog: { "2026-09-01": 1500 } }),
      "replace",
    );
    const after = getCachedNutritionSqliteState();
    expect(after.recipes.map((r) => r.id)).toEqual(["rcp_1"]);
    expect(after.waterLog).toEqual({ "2026-09-01": 1500 });
    expect(allOpKinds()).toContain("recipe-delete");
  });

  it("файл v1 без нових секцій у replace не стирає наявні рецепти, воду, список і цілі", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [RECIPE] as never,
      waterLog: { "2026-09-01": 1500 },
      shoppingList: SHOPPING as never,
      goalPeriods: [{ ...PERIOD, deletedAt: null }] as never,
    });
    await applyNutritionBackupPayload(
      {
        kind: NUTRITION_BACKUP_KIND,
        schemaVersion: 1,
        exportedAt: "2026-06-01T00:00:00.000Z",
        data: {
          stateSchemaVersion: 1,
          pantries: [{ id: "home", name: "Дім", text: "", items: [] }],
          activePantryId: "home",
          prefs: {},
        },
      },
      "replace",
    );
    const after = getCachedNutritionSqliteState();
    expect(after.recipes).toEqual([RECIPE]);
    expect(after.waterLog).toEqual({ "2026-09-01": 1500 });
    expect(after.shoppingList).toEqual(SHOPPING);
    expect(after.goalPeriods).toEqual([{ ...PERIOD, deletedAt: null }]);
    const kinds = allOpKinds();
    for (const k of [
      "recipe-upsert",
      "recipe-delete",
      "water-log-set",
      "shopping-list-set",
      "goal-period-restore",
    ]) {
      expect(kinds).not.toContain(k);
    }
  });

  it("merge додає лише відсутнє: рецепти за id, воду за днями, позиції списку, цілі за id", async () => {
    __setNutritionSqliteCacheForTests({
      recipes: [RECIPE] as never,
      waterLog: { "2026-09-01": 100 },
      shoppingList: SHOPPING as never,
      goalPeriods: [{ ...PERIOD, deletedAt: null }] as never,
    });
    await applyNutritionBackupPayload(
      v2File({
        recipes: [
          { ...RECIPE, title: "Інша назва" },
          { ...RECIPE, id: "rcp_2", title: "Нова" },
        ],
        waterLog: { "2026-09-01": 999, "2026-09-02": 50 },
        shoppingList: {
          categories: [
            {
              name: "Інше",
              items: [
                // той самий id: поточний стан «куплено» лишається
                { id: "si_1", name: "Хліб", quantity: "9", checked: false },
                { id: "si_2", name: "Молоко", quantity: "1", checked: false },
                // інший id, але назва вже є в категорії
                { id: "si_3", name: "хліб", quantity: "1", checked: false },
              ],
            },
          ],
        },
        goalPeriods: [
          PERIOD,
          { ...PERIOD, id: "gp::2026-04-01", effectiveFrom: "2026-04-01" },
        ],
      }),
      "merge",
    );
    const after = getCachedNutritionSqliteState();
    expect(after.recipes.map((r) => [r.id, r.title])).toEqual([
      ["rcp_1", "Борщ"],
      ["rcp_2", "Нова"],
    ]);
    expect(after.waterLog).toEqual({ "2026-09-01": 100, "2026-09-02": 50 });
    const items = loadShoppingList().categories.flatMap((c) => c.items);
    expect(items.map((i) => [i.id, i.checked])).toEqual([
      ["si_1", true],
      ["si_2", false],
    ]);
    expect(after.goalPeriods.map((p) => p.id)).toEqual([
      PERIOD.id,
      "gp::2026-04-01",
    ]);
    const kinds = allOpKinds();
    expect(kinds).not.toContain("recipe-delete");
    expect(kinds.filter((k) => k === "goal-period-restore")).toHaveLength(1);
  });

  it("зіпсовані сходинки цілей і рецепти без id відкидаються, решта імпортується", async () => {
    __setNutritionSqliteCacheForTests({});
    await applyNutritionBackupPayload(
      v2File({
        recipes: [{ title: "Без id" }, RECIPE],
        goalPeriods: [
          { ...PERIOD, id: "bad-kcal", kcal: 10_000_000 },
          { ...PERIOD, id: "bad-day", effectiveFrom: "2026-3-1" },
          { ...PERIOD, id: "bad-origin", origin: "hack" },
          PERIOD,
        ],
      }),
      "replace",
    );
    const after = getCachedNutritionSqliteState();
    expect(after.recipes.map((r) => r.id)).toEqual(["rcp_1"]);
    expect(after.goalPeriods.map((p) => p.id)).toEqual([PERIOD.id]);
  });

  it("відхилений запис секції не мовчить: промис падає, а решта секцій записується", async () => {
    // Початковий pull не завершено, локального рядка води немає: гейт
    // `persistNutritionWaterLog` відмовляє.
    __resetInitialPullStateForTests();
    __setNutritionSqliteCacheForTests({});
    await expect(
      applyNutritionBackupPayload(
        v2File({ recipes: [RECIPE], waterLog: { "2026-09-01": 1500 } }),
        "replace",
      ),
    ).rejects.toThrow("Частина даних Їжі не записалась");
    expect(getCachedNutritionSqliteState().recipes).toEqual([RECIPE]);
  });
});
