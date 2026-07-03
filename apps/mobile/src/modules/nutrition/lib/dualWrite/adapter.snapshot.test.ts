/**
 * SQL-snapshot gate — ADR-0073 Крок 0 (mobile).
 *
 * Фіксує байт-точну послідовність `(sql, params)`, яку mobile-nutrition-адаптер
 * виконує для канонічного набору операцій (по одній кожного kind).
 * Це специфікація поведінки пайплайна ПЕРЕД міграцією на
 * `@sergeant/dualwrite-core`: міграційні PR-и (Кроки 2-9) мають лишати
 * цей snapshot незмінним. Якщо snapshot змінився — це зміна семантики,
 * а не рефакторинг; такий diff дозволено ТІЛЬКИ в окремому
 * semantic-change PR з явним поясненням (див. ADR-0073 § Міграційний
 * план і § Ризики).
 *
 * Дзеркало канонічного веб-гейта
 * `apps/web/src/modules/finyk/lib/dualWrite/adapter.snapshot.test.ts`,
 * адаптоване під Jest (mobile-рig) замість Vitest. `pantry-upsert`
 * навмисно містить один item — це пінить і child-row цикл
 * (`nutrition_pantry_items`), і cleanup-гілку `NOT IN (…)`.
 *
 * AI-DANGER: не оновлюй `__snapshots__/adapter.snapshot.test.ts.snap`
 * «щоб тест пройшов» — розберись, чому SQL змінився.
 */
import { applyNutritionDualWriteOps } from "./adapter";
import type { NutritionDualWriteOp } from "./diff";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

function makeRecordingClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    run: jest.fn((sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return Promise.resolve(undefined);
    }),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

const OPTS = { userId: "u1", clientTs: "2026-06-23T00:00:00.000Z" };

/**
 * Канонічна фікстура: рівно один op кожного kind у фіксованому порядку.
 * Значення довільні, але заморожені — їх зміна теж міняє специфікацію.
 */
const CANONICAL_OPS: NutritionDualWriteOp[] = [
  {
    kind: "meal-upsert",
    meal: {
      id: "m1",
      dateKey: "2026-06-22",
      time: "08:30",
      mealType: "breakfast",
      name: "Вівсянка",
      label: "",
      macros: { kcal: 350, protein_g: 12.5, fat_g: 7, carbs_g: 60 },
      source: "manual",
      macroSource: "manual",
      amountG: 250,
      foodId: null,
      isDemo: false,
    },
  },
  { kind: "meal-delete", mealId: "m1" },
  {
    kind: "pantry-upsert",
    pantry: {
      id: "p1",
      name: "Дім",
      text: "",
      items: [{ id: "pi1", name: "Гречка", qty: 2, unit: "kg", notes: null }],
    },
  },
  { kind: "pantry-delete", pantryId: "p1" },
  {
    kind: "prefs-upsert",
    prefs: { prefsJson: "{}", activePantryId: "p1" },
  },
  {
    kind: "recipe-upsert",
    recipe: { id: "r1", title: "Борщ", dataJson: '{"steps":[]}' },
  },
  { kind: "recipe-delete", recipeId: "r1" },
  { kind: "water-log-set", dateKey: "2026-06-22", volumeMl: 1500 },
  {
    kind: "shopping-list-set",
    shoppingList: { dataJson: '{"categories":[]}' },
  },
] as never;

describe("mobile nutrition dual-write SQL snapshot (ADR-0073 Крок 0)", () => {
  it("emits a byte-stable (sql, params) sequence for the canonical op set", async () => {
    const { client, calls } = makeRecordingClient();

    const result = await applyNutritionDualWriteOps(
      client,
      CANONICAL_OPS,
      OPTS,
    );

    expect(result).toEqual({
      applied: CANONICAL_OPS.length,
      errored: 0,
      skipped: 0,
    });
    expect(calls).toMatchSnapshot();
  });

  it("is deterministic — a second run over the same ops emits the identical sequence", async () => {
    const first = makeRecordingClient();
    const second = makeRecordingClient();

    await applyNutritionDualWriteOps(first.client, CANONICAL_OPS, OPTS);
    await applyNutritionDualWriteOps(second.client, CANONICAL_OPS, OPTS);

    expect(second.calls).toEqual(first.calls);
  });
});
