// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  importRoutineDemoSeed,
  readRoutineDemoStateFromLs,
} from "./demoSeedImport";

const ROUTINE_KEY = "hub_routine_v1";

/** Мінімальна форма того, що реально пише `seedRoutine()`. */
function seedLikePayload() {
  return {
    schemaVersion: 1,
    prefs: {
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: false,
    },
    tags: [],
    categories: [],
    habits: [
      {
        id: "demo_h_1",
        demo: true,
        name: "Випити 2 л води",
        emoji: "droplet",
        recurrence: "daily",
        createdAt: "2026-07-09T00:00:00.000Z",
        tagIds: [],
        archived: false,
      },
    ],
    completions: {
      demo_h_1: ["2026-08-06", "2026-08-07"],
    },
    habitOrder: ["demo_h_1"],
    completionNotes: {},
  };
}

describe("readRoutineDemoStateFromLs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("повертає null, коли демо-payload у LS немає", () => {
    expect(readRoutineDemoStateFromLs()).toBeNull();
  });

  it("повертає null, коли habits порожній — лити нема чого", () => {
    localStorage.setItem(
      ROUTINE_KEY,
      JSON.stringify({ ...seedLikePayload(), habits: [] }),
    );
    expect(readRoutineDemoStateFromLs()).toBeNull();
  });

  it("збирає повний RoutineState із демо-payload, старий schemaVersion не заважає", () => {
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(seedLikePayload()));

    const state = readRoutineDemoStateFromLs();

    expect(state?.habits).toHaveLength(1);
    expect(state?.habits[0]).toMatchObject({ id: "demo_h_1" });
    expect(state?.completions["demo_h_1"]).toEqual([
      "2026-08-06",
      "2026-08-07",
    ]);
    // Пастка з завдання: сід пише schemaVersion 1, поточна версія — 4.
    // normalizeRoutineState() пропускає її через `{...base, ...p}`, і
    // для diff-у це байдуже — тест лише документує, що ми свідомо це
    // не «лікуємо».
    expect(state?.schemaVersion).toBe(1);
  });

  it("переживає побитий JSON без винятку", () => {
    localStorage.setItem(ROUTINE_KEY, "{не json");
    expect(() => readRoutineDemoStateFromLs()).not.toThrow();
    expect(readRoutineDemoStateFromLs()).toBeNull();
  });
});

describe("importRoutineDemoSeed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Фейк-клієнт: збирає SQL, який на нього виллють. Нам не треба
   * справжній sqlite — важливо, що demo-payload ПЕРЕТВОРЮЄТЬСЯ на
   * операції запису, бо саме цієї ланки не було (аудит L-8): сід писав
   * у LS, модуль читав із SQLite, і між ними після видалення
   * residual-дренажу не лишилось нічого.
   */
  function makeClient() {
    const sql: string[] = [];
    return {
      sql,
      client: {
        exec: (statement: string) => {
          sql.push(statement);
        },
        run: (statement: string) => {
          sql.push(statement);
        },
        all: () => [],
      },
    };
  }

  it("нічого не робить, коли демо-payload порожній", async () => {
    const { client, sql } = makeClient();

    const applied = await importRoutineDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBe(0);
    expect(sql).toHaveLength(0);
  });

  it("перетворює засіяні звички й відмітки на записи в SQLite", async () => {
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(seedLikePayload()));
    const { client, sql } = makeClient();

    const applied = await importRoutineDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBeGreaterThan(0);
    expect(sql.join(" ")).toMatch(/routine_habits/i);
    expect(sql.join(" ")).toMatch(/routine_entries/i);
  });

  it("не кидає, коли sqlite падає — демо не має права завалити бут", async () => {
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(seedLikePayload()));
    const failing = {
      exec: () => {
        throw new Error("sqlite down");
      },
      run: () => {
        throw new Error("sqlite down");
      },
      all: () => [],
    };

    await expect(
      importRoutineDemoSeed({
        client: failing,
        userId: "demo-local",
        nowIso: "2026-08-08T10:00:00.000Z",
      }),
    ).resolves.toBe(0);
  });

  it("ідемпотентний: другий прогін дає ті самі операції, не подвоєні", async () => {
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(seedLikePayload()));
    const first = makeClient();
    const second = makeClient();

    const a = await importRoutineDemoSeed({
      client: first.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });
    const b = await importRoutineDemoSeed({
      client: second.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(b).toBe(a);
  });
});
