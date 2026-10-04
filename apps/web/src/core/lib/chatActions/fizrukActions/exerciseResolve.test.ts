import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../../modules/fizruk/lib/sqliteReader";
import {
  __resetPendingChatExercisesForTests,
  buildWorkoutItemFromExercise,
  createChatExerciseResolver,
} from "./exerciseResolve";

beforeEach(() => {
  __resetPendingChatExercisesForTests();
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

  // Аудит data-01: латинська назва давала детермінований `custom_<slug>`, який
  // збігається з чужою вправою на глобальному PK `fizruk_custom_exercises`.
  it("id custom-вправи — custom_<uuid>, а не slug назви (латиниця теж)", () => {
    const ex = createChatExerciseResolver().resolve("Hip Thrust Special");
    expect(ex.id).toMatch(/^custom_[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(ex.id).not.toContain("hip");
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

  it("різні невідомі назви в РІЗНИХ резолверах (різні tool calls ходу) → різні id", () => {
    // `executeActions` запускає tool calls ходу синхронно, кеш між ними не
    // оновлюється, а резолвер на кожен виклик свіжий.
    vi.spyOn(Date, "now").mockReturnValue(1_777_000_000_000);
    const a = createChatExerciseResolver().resolve("Мій рух А");
    const b = createChatExerciseResolver().resolve("Мій рух Б");
    vi.mocked(Date.now).mockRestore();
    expect(b.id).not.toBe(a.id);
    expect(a.name.uk).toBe("Мій рух А");
    expect(b.name.uk).toBe("Мій рух Б");
  });

  it("та сама невідома назва в різних резолверах → та сама вправа, і вона є в created обох", () => {
    const r1 = createChatExerciseResolver();
    const a = r1.resolve("Мій рух");
    const r2 = createChatExerciseResolver();
    const b = r2.resolve("мій рух");
    expect(b.id).toBe(a.id);
    // Другий екзекутор теж перезапише вправу: item не лишиться без неї в outbox.
    expect(r2.created.map((ex) => ex.id)).toEqual([a.id]);
  });

  it("вправа, підтверджена кешем, виходить із реєстру: нову не дублюємо і не перекриваємо", () => {
    const a = createChatExerciseResolver().resolve("Мій рух");
    __setFizrukSqliteCacheForTests({
      customExercises: [{ ...a, name: { uk: "Мій рух", en: "Мій рух" } }],
    });
    const r = createChatExerciseResolver();
    expect(r.resolve("Мій рух").id).toBe(a.id);
    expect(r.created).toHaveLength(0);
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
