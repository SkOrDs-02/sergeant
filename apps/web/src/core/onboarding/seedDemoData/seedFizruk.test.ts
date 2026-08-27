import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeJSONMock } = vi.hoisted(() => ({ writeJSONMock: vi.fn() }));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return { ...actual, writeJSON: writeJSONMock };
});

import { seedFizruk } from "./seedFizruk";

describe("seedFizruk", () => {
  beforeEach(() => {
    writeJSONMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the fizruk workouts key with demo workouts", () => {
    seedFizruk();
    const workoutsCall = writeJSONMock.mock.calls.find(
      ([key]) => key === "fizruk_workouts_v1",
    );
    expect(workoutsCall).toBeDefined();
    const payload = workoutsCall![1] as {
      workouts?: Array<{ id?: string }>;
    };
    const workouts = Array.isArray(payload)
      ? (payload as Array<{ id?: string }>)
      : (payload.workouts ?? []);
    expect(workouts.length).toBeGreaterThan(0);
    expect(typeof workouts[0]!.id).toBe("string");
  });

  it("writes the measurements key", () => {
    seedFizruk();
    const keys = writeJSONMock.mock.calls.map(([k]) => k);
    expect(keys).toContain("fizruk_measurements_v1");
  });

  // L-21: сід писав `weight`/`waist`/`chest`, а SQLite dual-write адаптер
  // (`upsertMeasurement` у `sqliteWriter/adapter.ts`) читає рівно
  // `m["weightKg"]`/`m["waistCm"]`/`m["chestCm"]` — розбіжність імен
  // мовчки лягала в базу як NULL (`toRealOrNull(undefined) === null`).
  //
  // Первісна версія цього тесту сканувала джерело адаптера регексом і
  // вимагала буквального збігу КОЖНОГО засіяного ключа з тим, що читає
  // `m["…"]` — це хибний інваріант: реальний шлях запису йде через
  // `extractMeasurementSnapshots` (`fizrukDualWriteState.ts`), яка
  // легітимно коалесує `bicepLCm`/`bicepRCm` у `bicepCm` ПІСЛЯ сіду, тож
  // такий тест падав би й на коректному сіді. Цей тест натомість іде
  // тим самим швом, яким дані рухаються насправді —
  // `readFizrukDemoStateFromLs` → diff → `applyFizrukDualWriteOps`, усі
  // три всередині `importFizrukDemoSeed` — і перевіряє, що засіяне
  // значення долітає до SQL-параметрів UPSERT-у самим числом, а не
  // гасне в `null`.
  it("реальний dual-write pipeline записує засіяні заміри без NULL-полів (L-21)", async () => {
    localStorage.clear();
    try {
      // На відміну від інших тестів файлу, тут `writeJSON` мусить реально
      // писати в localStorage — `readFizrukDemoStateFromLs()` читає LS
      // напряму (через `safeReadLS`), а не бачить mock-виклики.
      writeJSONMock.mockImplementation((key: string, value: unknown) => {
        localStorage.setItem(key, JSON.stringify(value));
      });

      seedFizruk();

      const { importFizrukDemoSeed } =
        await import("../../../modules/fizruk/lib/demoSeedImport");

      const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
      const client = {
        exec: () => {},
        run: (sql: string, params: readonly unknown[] = []) => {
          calls.push({ sql, params });
        },
        all: () => [],
      };

      const applied = await importFizrukDemoSeed({
        client,
        userId: "demo-local",
        nowIso: "2026-08-08T10:00:00.000Z",
      });
      expect(applied).toBeGreaterThan(0);

      const measurementCall = calls.find(({ sql }) =>
        sql.includes("fizruk_measurements"),
      );
      expect(measurementCall).toBeDefined();
      // 78.4 / 82 / 100 — засіяні weightKg/waistCm/chestCm. Якщо ключ у
      // сіді розійдеться з ключем, який реально читає адаптер, сюди
      // прилетить `null`, а не ці числа.
      expect(measurementCall!.params).toEqual(
        expect.arrayContaining([78.4, 82, 100]),
      );
    } finally {
      localStorage.clear();
    }
  });

  it("сіє шаблони тренувань — «Із шаблону» не має відкривати порожнечу", () => {
    seedFizruk();
    const keys = writeJSONMock.mock.calls.map(([k]) => k);
    expect(keys).toContain("fizruk_workout_templates_v1");
  });

  // Ключі мʼязів мусять бути ДОМЕННІ. Невідомий ключ мапиться в `null`,
  // випадає з силуету «Моє тіло» і спливає сирим англійським рядком у
  // списку «Почекати» — саме це й було видно наживо 2026-08-08
  // («Почекати: Квадрицепс, back, shoulders»), щойно демо знову
  // почало доїжджати до модуля.
  it("вживає лише ключі мʼязів, які розуміє mapDomainMuscleToAtlas", async () => {
    const { mapDomainMuscleToAtlas } =
      await import("@sergeant/fizruk-domain/data");
    seedFizruk();
    const payload = writeJSONMock.mock.calls.find(
      ([key]) => key === "fizruk_workouts_v1",
    )![1] as {
      workouts: Array<{
        items: Array<{
          musclesPrimary?: string[];
          musclesSecondary?: string[];
        }>;
      }>;
    };

    const unmapped: string[] = [];
    for (const workout of payload.workouts) {
      for (const item of workout.items) {
        for (const muscle of [
          ...(item.musclesPrimary ?? []),
          ...(item.musclesSecondary ?? []),
        ]) {
          if (mapDomainMuscleToAtlas(muscle) === null) unmapped.push(muscle);
        }
      }
    }

    expect(unmapped).toEqual([]);
  });
});
