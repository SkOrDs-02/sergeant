/**
 * DCRUD-007 запобіжник для append-only журналу комори
 * (`nutrition_pantry_events`, W1-PANTRY-APPEND стадія 1).
 *
 * Чому цей тест існує ЗАРАЗ, коли адаптер у журнал ще навіть не пише.
 * -------------------------------------------------------------------
 * Саме cleanup-логіка dual-write адаптера одного разу вже МАСОВО
 * soft-видалила позиції комори користувача — див. коментар DCRUD-007 у
 * `apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts`.
 * Для лічильника `qty` це втрата залишку. Для журналу та сама помилка
 * знищила б САМУ ІСТОРІЮ, з якої залишок відновлюється, — тобто
 * непоправно і без шансу на parity-звірку.
 *
 * `pantry-delete` і `pantry-upsert` обидва запускають реконсиляцію дітей
 * за `parentColumn = pantry_id` (`softDeletePantry`,
 * `softDeleteRemovedChildren` в `adapter.ts`). Журнал теж має `pantry_id`,
 * тож він — рівно того «дитячого» вигляду, на який ця логіка полює.
 * Тест фіксує, що жодна операція адаптера НЕ згадує таблицю журналу — ні
 * в DELETE, ні в UPDATE, ні в INSERT.
 *
 * Другий шар захисту — механічний, у самому білдері SQL:
 * `APPEND_ONLY_TABLES` / `assertNotAppendOnly` у
 * `packages/dualwrite-core/src/tableSpec.ts` кидають помилку, якщо
 * хтось спробує зібрати delete/reconcile для журналу
 * (`tableSpec.test.ts`). Цей файл перевіряє поверхню nutrition-адаптера,
 * той — сам примітив.
 *
 * AI-DANGER: якщо стадія 2 навчить адаптер писати події, цей тест треба
 * ЗВУЗИТИ (заборонити DELETE/UPDATE-cleanup по журналу), а НЕ видалити.
 */
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("../../../../../core/syncEngine/fireSyncOutboxUpsert.js", () => ({
  fireSyncOutboxUpsert: vi.fn(),
}));

import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  APPEND_ONLY_TABLES,
  buildDelete,
  buildReconcileChildren,
} from "@sergeant/dualwrite-core";
import { applyNutritionDualWriteOps } from "../adapter";
import type { NutritionDualWriteOp } from "../diff.js";

const LEDGER = "nutrition_pantry_events";

function makeRecordingClient(): {
  client: SqliteMigrationClient;
  calls: string[];
} {
  const calls: string[] = [];
  const client = {
    run: vi.fn((sql: string) => {
      calls.push(sql);
      return Promise.resolve(undefined);
    }),
    all: vi.fn(() => Promise.resolve([])),
    exec: vi.fn(() => Promise.resolve(undefined)),
    get: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

/**
 * Операції, що зачіпають parent/child-шлях комори — саме ті, що в
 * інциденті DCRUD-007 масово стерли дітей.
 */
const PANTRY_OPS: NutritionDualWriteOp[] = [
  {
    kind: "pantry-upsert",
    pantry: {
      id: "home",
      name: "Дім",
      text: "молоко 1 л",
      items: [
        {
          id: "home::0::молоко",
          name: "молоко",
          qty: 1,
          unit: "л",
          notes: null,
        },
      ],
    },
  },
  // Upsert тієї ж комори БЕЗ позицій — гілка «прибери дітей, яких немає
  // в новому стані» (keepCount === 0).
  {
    kind: "pantry-upsert",
    pantry: { id: "home", name: "Дім", text: "", items: [] },
  },
  { kind: "pantry-delete", pantryId: "home" },
];

describe("nutrition dual-write adapter — журнал комори недоторканний", () => {
  it("жодна pantry-операція не згадує nutrition_pantry_events", async () => {
    const { client, calls } = makeRecordingClient();

    await applyNutritionDualWriteOps(client, PANTRY_OPS, {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });

    expect(calls.length).toBeGreaterThan(0);
    const touching = calls.filter((sql) => sql.includes(LEDGER));
    expect(touching).toEqual([]);
  });

  it("cleanup дітей комори привʼязаний до nutrition_pantry_items, не до журналу", async () => {
    const { client, calls } = makeRecordingClient();

    await applyNutritionDualWriteOps(client, [PANTRY_OPS[2]!], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });

    // Каскад по дітях справді відпрацював (інакше тест би нічого не
    // доводив) — і він стосується лічильникової таблиці.
    const cascade = calls.filter(
      (sql) => sql.includes("pantry_id = ?") && sql.includes("deleted_at"),
    );
    expect(cascade.length).toBeGreaterThan(0);
    for (const sql of cascade) {
      expect(sql).toContain("nutrition_pantry_items");
      expect(sql).not.toContain(LEDGER);
    }
  });

  it("журнал зареєстрований як append-only і білдери на нього не працюють", () => {
    expect(APPEND_ONLY_TABLES.has(LEDGER)).toBe(true);
    expect(() =>
      buildReconcileChildren({ table: LEDGER, parentColumn: "pantry_id" }, 0),
    ).toThrow(/append-only/);
    expect(() =>
      buildDelete({
        table: LEDGER,
        deletePolicy: "soft",
        matchColumns: ["id", "user_id"],
      }),
    ).toThrow(/append-only/);
  });
});
