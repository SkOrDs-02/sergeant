import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../../modules/fizruk/lib/sqliteReader";
import {
  buildWorkoutItemFromExercise,
  createChatExerciseResolver,
} from "./exerciseResolve";

beforeEach(() => {
  clearFizrukSqliteCache();
  __setFizrukSqliteCacheForTests({});
});
afterEach(() => clearFizrukSqliteCache());

describe("createChatExerciseResolver", () => {
  it("точний збіг назви (без урахування регістру) → каталожна вправа", () => {
    const r = createChatExerciseResolver();
    expect(r.resolve("  СТАНОВА ТЯГА ").id).toBe("deadlift");
    expect(r.created).toHaveLength(0);
  });

  it("точний збіг за аліасом", () => {
    const r = createChatExerciseResolver();
    expect(r.resolve("бенч").id).toBe("bench_press_barbell");
  });

  it("точний збіг важить більше за частковий (присідання → squat_barbell)", () => {
    expect(createChatExerciseResolver().resolve("Присідання").id).toBe(
      "squat_barbell",
    );
  });

  it("неоднозначний частковий збіг НЕ обирає першу-ліпшу, а створює custom", () => {
    const r = createChatExerciseResolver();
    const ex = r.resolve("жим лежачи");
    expect(ex.id).toMatch(/^custom_/);
    expect(r.created).toEqual([ex]);
  });

  it("невідома назва → custom із непорожнім id і тією ж назвою", () => {
    const r = createChatExerciseResolver();
    const ex = r.resolve("Мій рух");
    expect(ex.id).toMatch(/^custom_/);
    expect(ex.name.uk).toBe("Мій рух");
    expect(ex.primaryGroup).toBe("full_body");
  });

  it("та сама невідома назва двічі → одна вправа, не дубль", () => {
    const r = createChatExerciseResolver();
    const a = r.resolve("Мій рух");
    const b = r.resolve("мій рух");
    expect(b.id).toBe(a.id);
    expect(r.created).toHaveLength(1);
  });

  it("різні невідомі назви в один мілісекундний тік → різні id", () => {
    const r = createChatExerciseResolver();
    const ids = ["А рух", "Б рух", "В рух"].map((n) => r.resolve(n).id);
    expect(new Set(ids).size).toBe(3);
  });

  it("використовує вже наявну custom-вправу з кешу, нової не створює", () => {
    __setFizrukSqliteCacheForTests({
      customExercises: [
        {
          id: "custom_123",
          name: { uk: "Мій рух", en: "Мій рух" },
          primaryGroup: "full_body",
        },
      ],
    });
    const r = createChatExerciseResolver();
    expect(r.resolve("Мій рух").id).toBe("custom_123");
    expect(r.created).toHaveLength(0);
  });

  it("холодний кеш: custom-вправи не читаються, але каталог працює", () => {
    clearFizrukSqliteCache();
    expect(createChatExerciseResolver().resolve("Станова тяга").id).toBe(
      "deadlift",
    );
  });
});

describe("buildWorkoutItemFromExercise", () => {
  it("копіює поля вправи і ніколи не лишає порожній exerciseId", () => {
    const ex = createChatExerciseResolver().resolve("Станова тяга");
    const item = buildWorkoutItemFromExercise(ex, "i1", [
      { weightKg: 100, reps: 5 },
    ]);
    expect(item).toMatchObject({
      id: "i1",
      exerciseId: "deadlift",
      nameUk: "Станова тяга",
      type: "strength",
    });
    expect(item.primaryGroup).not.toBe("");
    expect(item.musclesPrimary.length).toBeGreaterThan(0);
  });
});
