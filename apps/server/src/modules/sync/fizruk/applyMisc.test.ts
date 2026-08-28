import { describe, expect, it } from "vitest";

import {
  applyFizrukCustomExercises,
  applyFizrukMeasurements,
} from "./applyMisc.js";
import {
  asClient,
  FakeClient,
  lastQuery,
  syncOp,
} from "./__tests__/testHelpers.js";

// Харнес (FakeClient / asClient / syncOp / lastQuery) винесено у
// __testHelpers.ts і поділяється з applySync.test.ts та
// applyInjuries.test.ts — той самий fake-клієнт, три колоковані файли.

describe("applyFizrukCustomExercises", () => {
  const clientTs = new Date("2026-07-21T08:00:00.000Z");

  it("rejects a row without id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", { user_id: "user-1" }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a completely missing user_id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a mismatched user_id (cross-user isolation)", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "someone-else",
          data_json: { sets: 3 },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects fk_violation when the existing row belongs to another user", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "someone-else",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
    // Ownership-перевірка мала зупинити хід ще до UPDATE.
    expect(fake.queries).toHaveLength(1);
  });

  it("rejects lww_conflict when the existing row is newer or equal to clientTs", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: clientTs, deleted_at: null },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  // Регресія SERGEANT-WEB-T. Раніше цей стан давав `tombstoned`, і undo
  // після видалення мовчки не доїжджав на сервер. Тепер новіший запис
  // воскрешає рядок — це LWW, за яким живе решта синку.
  it("новіший запис воскрешає soft-deleted вправу", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    // Не лише «не відхилено»: UPDATE справді знімає мітку видалення —
    // `deleted_at` це `$3`, і вхідний рядок його не несе, тож там `null`.
    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_custom_exercises");
    expect(update.params[2]).toBeNull();
  });

  it("allows deleting a row that is already soft-deleted (idempotent retract)", async () => {
    // Повторний delete-op з офлайн-черги не має падати з помилкою:
    // видалення вже видаленого — це той самий стан, а не конфлікт.
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "delete", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("rejects deleting a row that does not exist", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "delete", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });
  });

  it("soft-deletes an existing row with the client timestamp, not server now()", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "delete", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_custom_exercises");
    expect(update.sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
    expect(update.params).toEqual([clientTs, "custom-1", "user-1"]);
  });

  it("rejects an insert without data_json", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_data_json" });
  });

  it("rejects garbage created_at / deleted_at with field-specific reasons", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
          created_at: "not-a-date",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_created_at" });

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { sets: 3 },
          deleted_at: "not-a-date",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_deleted_at" });
  });

  it("inserts a new row, JSON-serializing an object data_json", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "insert", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { name: "Bulgarian split squat", muscles: ["quads"] },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_custom_exercises");
    expect(insert.params).toEqual([
      "custom-1",
      "user-1",
      JSON.stringify({ name: "Bulgarian split squat", muscles: ["quads"] }),
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("does not double-encode an already-serialized JSON string data_json", async () => {
    // Регресія з аудиту 2026-08-04 (знахідка 3, backfill — міграція 102):
    // клієнтський SQLite-адаптер шле цей blob уже як TEXT-серіалізований
    // JSON. Безумовний JSON.stringify() загорнув би рядок ще раз, і
    // `data_json->>'...'` на сервері читав би NULL.
    const fake = new FakeClient();
    const alreadySerialized = JSON.stringify({ name: "Push-up", sets: 3 });

    await applyFizrukCustomExercises(
      asClient(fake),
      syncOp("fizruk_custom_exercises", "insert", {
        id: "custom-1",
        user_id: "user-1",
        data_json: alreadySerialized,
      }),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[2]).toBe(alreadySerialized);
    // Контрольна умова: параметр — валідний однократно-серіалізований JSON.
    expect(JSON.parse(insert.params[2] as string)).toEqual({
      name: "Push-up",
      sets: 3,
    });
  });

  it("updates an existing row, keeping the same field order in params", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukCustomExercises(
        asClient(fake),
        syncOp("fizruk_custom_exercises", "update", {
          id: "custom-1",
          user_id: "user-1",
          data_json: { name: "renamed" },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_custom_exercises");
    expect(update.params).toEqual([
      JSON.stringify({ name: "renamed" }),
      clientTs,
      null,
      "custom-1",
      "user-1",
    ]);
  });
});

describe("applyFizrukMeasurements", () => {
  const clientTs = new Date("2026-07-21T08:00:00.000Z");

  function validRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "measure-1",
      user_id: "user-1",
      measured_at: "2026-07-21T06:00:00.000Z",
      weight_kg: 72.5,
      waist_cm: 80,
      chest_cm: 100,
      hips_cm: 95,
      bicep_cm: 35,
      sleep_hours: 7.5,
      energy_level: 4,
      mood: 3,
      ...overrides,
    };
  }

  it("rejects a row without id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", { user_id: "user-1" }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a completely missing user_id before any query runs", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["user_id"];

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", row),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a mismatched user_id (cross-user isolation)", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp(
          "fizruk_measurements",
          "insert",
          validRow({ user_id: "someone-else" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a missing or garbage measured_at (NOT NULL column) with invalid_measured_at", async () => {
    const fake = new FakeClient();
    const missing = validRow();
    delete (missing as Record<string, unknown>)["measured_at"];

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", missing),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_measured_at" });

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp(
          "fizruk_measurements",
          "insert",
          validRow({ measured_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_measured_at" });
  });

  it.each([
    ["weight_kg", "invalid_weight_kg"],
    ["waist_cm", "invalid_waist_cm"],
    ["chest_cm", "invalid_chest_cm"],
    ["hips_cm", "invalid_hips_cm"],
    ["bicep_cm", "invalid_bicep_cm"],
    ["sleep_hours", "invalid_sleep_hours"],
    ["energy_level", "invalid_energy_level"],
    ["mood", "invalid_mood"],
  ] as const)(
    "rejects a non-numeric %s payload with %s (curl bypasses client validation)",
    async (field, reason) => {
      const fake = new FakeClient();

      await expect(
        applyFizrukMeasurements(
          asClient(fake),
          syncOp(
            "fizruk_measurements",
            "insert",
            validRow({ [field]: "not-a-number" }),
          ),
          "user-1",
          clientTs,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    },
  );

  it("floors fractional energy_level and mood to integers", async () => {
    const fake = new FakeClient();

    await applyFizrukMeasurements(
      asClient(fake),
      syncOp(
        "fizruk_measurements",
        "insert",
        validRow({ energy_level: 4.9, mood: 2.1 }),
      ),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    // params order: id, user_id, measured_at, weight_kg, waist_cm, chest_cm,
    // hips_cm, bicep_cm, sleep_hours, energy_level, mood, created_at,
    // updated_at, deleted_at
    expect(insert.params[9]).toBe(4);
    expect(insert.params[10]).toBe(2);
  });

  it("stores an absent optional measurement as null, not zero", async () => {
    // Тиха втрата: якщо відсутнє поле мовчки перетворюється на 0, клієнт
    // ніколи не дізнається, що вимір не був надісланий.
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["weight_kg"];
    delete (row as Record<string, unknown>)["mood"];

    await applyFizrukMeasurements(
      asClient(fake),
      syncOp("fizruk_measurements", "insert", row),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[3]).toBeNull();
    expect(insert.params[10]).toBeNull();
  });

  it("rejects out-of-range measurement values instead of storing them", async () => {
    // Регресійний якір на побічну знахідку аудиту 2026-08-04: до фіксу ці
    // поля читались НЕобмеженими parseOptionalNumber / parseOptionalInt,
    // тож у базу проходили `weight_kg: -500` і `sleep_hours: 999`. Тепер
    // діють канонічні межі MEASUREMENT_BOUNDS з @sergeant/shared — ті самі,
    // що і в клієнтському реєстрі полів.
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", validRow({ weight_kg: -500 })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_weight_kg" });

    // Відхилення має статись ДО будь-якого запису.
    expect(
      fake.queries.some((q) => /INSERT INTO fizruk_measurements/.test(q.sql)),
    ).toBe(false);
  });

  it.each([
    ["weight_kg", 19, "invalid_weight_kg"],
    ["weight_kg", 401, "invalid_weight_kg"],
    ["waist_cm", 29, "invalid_waist_cm"],
    ["chest_cm", 301, "invalid_chest_cm"],
    ["hips_cm", 0, "invalid_hips_cm"],
    ["bicep_cm", 101, "invalid_bicep_cm"],
    ["sleep_hours", -1, "invalid_sleep_hours"],
    ["sleep_hours", 25, "invalid_sleep_hours"],
    ["energy_level", 0, "invalid_energy_level"],
    ["energy_level", 6, "invalid_energy_level"],
    ["mood", 0, "invalid_mood"],
    ["mood", 7, "invalid_mood"],
  ])(
    "rejects %s = %s as out of canonical bounds",
    async (field, value, reason) => {
      const fake = new FakeClient();

      await expect(
        applyFizrukMeasurements(
          asClient(fake),
          syncOp(
            "fizruk_measurements",
            "insert",
            validRow({ [field as string]: value }),
          ),
          "user-1",
          clientTs,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    },
  );

  it.each([
    ["weight_kg", 20],
    ["weight_kg", 400],
    ["sleep_hours", 0],
    ["sleep_hours", 24],
    ["energy_level", 1],
    ["mood", 5],
  ])("accepts %s = %s — межі включні", async (field, value) => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp(
          "fizruk_measurements",
          "insert",
          validRow({ [field as string]: value }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("floors a fractional wellbeing score before the bounds check", async () => {
    // Порядок операцій у parseOptionalBoundedInt: спершу floor, потім межі.
    // Клієнт, що прислав 5.4, і далі отримує 5 — інакше фікс зламав би
    // тих, хто раніше працював.
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp(
          "fizruk_measurements",
          "insert",
          validRow({ energy_level: 5.4 }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    expect(lastQuery(fake).params[9]).toBe(5);
  });

  it("inserts a new measurement with the full param set in order", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "insert", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_measurements");
    expect(insert.params).toEqual([
      "measure-1",
      "user-1",
      new Date("2026-07-21T06:00:00.000Z"),
      72.5,
      80,
      100,
      95,
      35,
      7.5,
      4,
      3,
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("rejects fk_violation when the existing row belongs to another user", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "someone-else",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
  });

  it("rejects lww_conflict when the existing row is newer or equal to clientTs", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: clientTs, deleted_at: null },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  // Регресія SERGEANT-WEB-T. Той самий стан раніше давав `tombstoned`, через
  // що `restoreEntry` у `useMeasurements` мовчки не доїжджав на сервер.
  it("новіший запис воскрешає soft-deleted вимір", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    // Мітку видалення справді знято: `deleted_at` це `$11`, а вхідний рядок
    // його не несе, тож туди лягає `null`.
    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_measurements");
    expect(update.params[10]).toBeNull();
  });

  it("allows deleting a measurement that is already soft-deleted (idempotent retract)", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "delete", {
          id: "measure-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("rejects deleting a row that does not exist", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "delete", {
          id: "measure-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });
  });

  it("soft-deletes an existing measurement with the client timestamp", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "delete", {
          id: "measure-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_measurements");
    expect(update.sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
    expect(update.params).toEqual([clientTs, "measure-1", "user-1"]);
  });

  it("updates an existing measurement, keeping the same field order in params", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukMeasurements(
        asClient(fake),
        syncOp("fizruk_measurements", "update", validRow({ weight_kg: 71.2 })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_measurements");
    expect(update.params).toEqual([
      new Date("2026-07-21T06:00:00.000Z"),
      71.2,
      80,
      100,
      95,
      35,
      7.5,
      4,
      3,
      clientTs,
      null,
      "measure-1",
      "user-1",
    ]);
  });
});
