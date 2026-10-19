/**
 * data-40 (ADR-0077 § 3.2, поправка 2026-10-10): mobile не перейменовує
 * стабільні id позицій комори на позиційні.
 *
 * Сценарій з рев'ю: веб (нова версія) створив позицію `pi_…`; mobile
 * правив будь-яку позицію комори, виводив для неї позиційний id
 * `home::2::Eggs` і повним reconcile soft-delete-ив `pi_…`. Наступна правка
 * веба воскрешала tombstone, і на всіх пристроях жили дві однакові позиції.
 *
 * Тест ганяє РЕАЛЬНІ рідер -> стор -> знімок -> diff -> адаптер; мокається
 * лише мережа/outbox і SQLite-клієнт, що віддає рядки.
 */
jest.mock("@/core/syncEngine/enqueueOutboxUpsert", () => ({
  enqueueOutboxUpsert: jest.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
jest.mock("@/lib/storage", () => ({
  safeReadLS: jest.fn(() => null),
  safeReadStringLS: jest.fn(() => null),
  safeWriteLS: jest.fn(() => true),
}));

const mockTrigger = jest.fn();
jest.mock("../sqliteWriter", () => {
  const actual = jest.requireActual("../sqliteWriter");
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => mockTrigger(...args),
    isNutritionDualWriteRegistered: () => true,
  };
});

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { loadPantries, savePantries } from "../nutritionStore";
import {
  clearNutritionSqliteCache,
  refreshNutritionSqliteState,
} from "../sqliteReader";
import { applyNutritionDualWriteOps } from "../sqliteWriter/adapter";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
} from "../sqliteWriter/diff";
import { __testing as residualTesting } from "../residualImport";

const STABLE = "pi_6f1c0e8e-aaaa-bbbb-cccc-000000000001";

function readerClient(): SqliteMigrationClient {
  return {
    all: jest.fn((sql: string) => {
      if (sql.includes("FROM nutrition_pantries")) {
        return Promise.resolve([{ id: "home", name: "Дім", text: "" }]);
      }
      if (sql.includes("FROM nutrition_pantry_items")) {
        return Promise.resolve([
          { id: "home::0::Rice", pantry_id: "home", name: "Rice", qty: 1 },
          { id: "home::1::Milk", pantry_id: "home", name: "Milk", qty: 1 },
          { id: STABLE, pantry_id: "home", name: "Eggs", qty: 6 },
        ]);
      }
      return Promise.resolve([]);
    }),
  } as unknown as SqliteMigrationClient;
}

beforeEach(() => {
  mockTrigger.mockReset();
  clearNutritionSqliteCache();
});

describe("mobile pantry — стабільні id переживають запис", () => {
  it("правка іншої позиції не перейменовує pi_-рядок і не soft-delete-ить його", async () => {
    await refreshNutritionSqliteState(readerClient(), "u1");

    const pantries = loadPantries();
    expect(pantries[0]!.items.map((i) => i.id)).toEqual([
      "home::0::Rice",
      "home::1::Milk",
      STABLE,
    ]);

    // Користувач змінює кількість першої позиції.
    const edited = pantries.map((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === 0 ? { ...it, qty: 5 } : it)),
    }));
    savePantries(edited, "home");

    const [prev, next] = mockTrigger.mock.calls[0] as [
      NutritionDualWriteState,
      NutritionDualWriteState,
    ];
    expect(prev.pantries[0]!.items.map((i) => i.id)).toEqual(
      next.pantries[0]!.items.map((i) => i.id),
    );

    const ops = diffNutritionDualWriteOps(prev, next);
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const writer = {
      run: jest.fn((sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return Promise.resolve(undefined);
      }),
      all: jest.fn(() => Promise.resolve([])),
    } as unknown as SqliteMigrationClient;
    await applyNutritionDualWriteOps(writer, ops, {
      userId: "u1",
      clientTs: "2026-10-18T00:00:00.000Z",
    });

    const itemWrites = calls.filter((c) =>
      c.sql.includes("INSERT INTO nutrition_pantry_items"),
    );
    expect(itemWrites.map((c) => c.params[0])).toEqual([
      "home::0::Rice",
      "home::1::Milk",
      STABLE,
    ]);
    // Жодного позиційного двійника pi_-рядка.
    const everyParam = calls.flatMap((c) => [...c.params]);
    expect(everyParam).not.toContain("home::2::Eggs");
    // Reconcile тримає pi_-рядок у keepIds, а не soft-delete-ить.
    const reconcile = calls.find((c) => c.sql.includes("NOT IN"));
    expect(reconcile?.params).toContain(STABLE);
  });

  it("residualImport віддає явний id позиції, а безідову нумерує як раніше", () => {
    const out = residualTesting.extractPantrySnapshots([
      {
        id: "home",
        name: "Дім",
        text: "",
        items: [
          { id: STABLE, name: "Eggs", qty: 6, unit: null, notes: null },
          { name: "Rice", qty: 1, unit: null, notes: null },
        ],
      },
    ]);
    expect(out[0]!.items.map((i) => i.id)).toEqual([STABLE, "home::1::Rice"]);
  });
});
