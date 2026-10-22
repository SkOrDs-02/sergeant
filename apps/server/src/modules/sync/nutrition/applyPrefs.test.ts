import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyNutritionPrefs } from "./applyPrefs.js";

/**
 * data-04: поле-рівневе злиття `nutrition_prefs.prefs_json`.
 *
 * Фейковий клієнт записує SQL і віддає заздалегідь підготовлені рядки:
 * перший SELECT (існуючий рядок) і RETURNING злитого UPDATE. Саме злиття
 * (`prefs_json || $1`) виконує Postgres, тому тут перевіряємо форму SQL,
 * параметри, LWW-відмову і те, що в журнал піде ПОВНИЙ знімок.
 */

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];
  constructor(
    private readonly existing: { updated_at: Date } | null,
    private readonly updateReturning: unknown[] = [],
  ) {}

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params });
    if (/^\s*SELECT\b/i.test(sql)) {
      return {
        rows: this.existing ? [{ user_id: "u1", ...this.existing }] : [],
      };
    }
    if (/RETURNING prefs_json/i.test(sql)) {
      return {
        rows: this.updateReturning,
        rowCount: this.updateReturning.length,
      };
    }
    return { rows: [], rowCount: 1 };
  }
}

const asClient = (f: FakeClient) => f as unknown as PoolClient;
const TS = new Date("2026-10-20T10:00:00.000Z");
const OLDER = new Date("2026-10-20T09:00:00.000Z");

function op(row: Record<string, unknown>): SyncV2Op {
  return { op: "update", table: "nutrition_prefs", row } as SyncV2Op;
}

describe("applyNutritionPrefs: prefs_merge (data-04)", () => {
  it("без прапорця лишає повну заміну (зворотна сумісність)", async () => {
    const fake = new FakeClient({ updated_at: OLDER });
    const o = op({ user_id: "u1", prefs_json: '{"waterGoalMl":2000}' });

    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", TS),
    ).resolves.toEqual({ status: "applied" });

    const upd = fake.queries[fake.queries.length - 1]!;
    expect(upd.sql).toContain("SET prefs_json       = $1::jsonb");
    expect(upd.sql).not.toContain("||");
    expect(upd.params[0]).toBe('{"waterGoalMl":2000}');
    // Рядок не переписується: журнал бачить те, що прислав клієнт.
    expect(o.row["prefs_json"]).toBe('{"waterGoalMl":2000}');
  });

  it("з прапорцем накладає патч через || і кладе в журнал повний знімок", async () => {
    const full = {
      waterGoalMl: 2750,
      mealTemplates: [{ id: "t1" }],
      goal: "balanced",
    };
    const fake = new FakeClient({ updated_at: OLDER }, [{ prefs_json: full }]);
    const o = op({
      user_id: "u1",
      prefs_json: { waterGoalMl: 2750 },
      prefs_merge: true,
    });

    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", TS),
    ).resolves.toEqual({ status: "applied" });

    const upd = fake.queries[fake.queries.length - 1]!;
    expect(upd.sql).toContain("prefs_json || $1::jsonb");
    expect(upd.params[0]).toBe('{"waterGoalMl":2750}');
    // Без active_pantry_id у рядку серверне значення зберігається.
    expect(upd.sql).toContain("CASE WHEN $5::boolean");
    expect(upd.params[4]).toBe(false);

    // AI-DANGER: журнал/pull отримують злитий знімок без прапорця.
    expect(JSON.parse(o.row["prefs_json"] as string)).toEqual(full);
    expect(o.row).not.toHaveProperty("prefs_merge");
  });

  it("явний active_pantry_id у патчі перезаписується", async () => {
    const fake = new FakeClient({ updated_at: OLDER }, [{ prefs_json: {} }]);
    const o = op({
      user_id: "u1",
      prefs_json: "{}",
      active_pantry_id: "home",
      prefs_merge: true,
    });
    await applyNutritionPrefs(asClient(fake), o, "u1", TS);
    const upd = fake.queries[fake.queries.length - 1]!;
    expect(upd.params[1]).toBe("home");
    expect(upd.params[4]).toBe(true);
  });

  it("LWW: старіший патч відхиляється, нічого не пишеться", async () => {
    const fake = new FakeClient({ updated_at: TS });
    const o = op({ user_id: "u1", prefs_json: { a: 1 }, prefs_merge: true });
    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", OLDER),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(fake.queries).toHaveLength(1);
  });

  it("LWW у гонці: UPDATE не зачепив рядок (RETURNING порожній)", async () => {
    const fake = new FakeClient({ updated_at: OLDER }, []);
    const o = op({ user_id: "u1", prefs_json: { a: 1 }, prefs_merge: true });
    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", TS),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(o.row["prefs_merge"]).toBe(true);
  });

  it.each([
    ["масив", "[1,2]"],
    ["скаляр", "5"],
    ["сміття", "{oops"],
    ["null", null],
  ])("відхиляє непридатний патч: %s", async (_n, prefsJson) => {
    const fake = new FakeClient({ updated_at: OLDER });
    const o = op({ user_id: "u1", prefs_json: prefsJson, prefs_merge: true });
    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", TS),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_prefs_patch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("першого рядка немає: патч вставляється як є, журнал отримує знімок", async () => {
    const fake = new FakeClient(null);
    const o = op({
      user_id: "u1",
      prefs_json: { waterGoalMl: 2500 },
      prefs_merge: true,
    });
    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", TS),
    ).resolves.toEqual({ status: "applied" });
    const ins = fake.queries[fake.queries.length - 1]!;
    expect(ins.sql).toContain("INSERT INTO nutrition_prefs");
    expect(ins.params[1]).toBe('{"waterGoalMl":2500}');
    expect(o.row).not.toHaveProperty("prefs_merge");
  });

  it("чужий user_id відхиляється до будь-якого SQL", async () => {
    const fake = new FakeClient(null);
    const o = op({ user_id: "other", prefs_json: {}, prefs_merge: true });
    await expect(
      applyNutritionPrefs(asClient(fake), o, "u1", TS),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });
});
