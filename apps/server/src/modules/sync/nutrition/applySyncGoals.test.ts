import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyNutritionGoalPeriods } from "./applySyncGoals.js";

/**
 * W1-KBJU-APPEND, СТАДІЯ 1 — apply-шлях append-only журналу цілей КБЖВ.
 *
 * Головне, що тут фіксується:
 *   1. журнал НЕ редагується (`update` → `append_only_violation`);
 *   2. `delete` — це РЕТРАКЦІЯ (tombstone), а не знищення рядка;
 *   3. НЕМАЄ LWW-guard-а: дві зміни цілі з двох пристроїв у різні дні —
 *      це дві сходинки історії, а не конфлікт. Саме цим хендлер свідомо
 *      відрізняється від сусіднього `applyNutritionPrefs`;
 *   4. повторна доставка того самого push-а не подвоює сходинку;
 *   5. `effective_from` мусить бути day key, а не ISO-instant.
 */

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];
  private readonly responses: Array<{ rows: unknown[]; rowCount?: number }> =
    [];

  enqueue(response: { rows: unknown[]; rowCount?: number }): this {
    this.responses.push(response);
    return this;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ sql, params });
    const next = this.responses.shift();
    const rows = (next?.rows ?? []) as T[];
    return { rows, rowCount: next?.rowCount ?? rows.length };
  }
}

function asClient(fake: FakeClient): PoolClient {
  return fake as unknown as PoolClient;
}

const CLIENT_TS = new Date("2026-07-25T08:00:00.000Z");
const USER = "user-1";

function op(
  row: Record<string, unknown>,
  kind: SyncV2Op["op"] = "insert",
): SyncV2Op {
  return {
    op: kind,
    table: "nutrition_goal_periods",
    row,
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: "test-op",
  } as unknown as SyncV2Op;
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "gp::2026-07-25::1800:140:55:180:2500::device-a",
    user_id: USER,
    effective_from: "2026-07-25",
    kcal: 1800,
    protein_g: 140,
    fat_g: 55,
    carbs_g: 180,
    water_ml: 2500,
    origin: "manual",
    created_at: "2026-07-25T07:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("applyNutritionGoalPeriods — insert", () => {
  it("вставляє сходинку і віддає applied", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "applied" });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]!.sql).toMatch(/INSERT INTO nutrition_goal_periods/);
  });

  it("ідемпотентний через ON CONFLICT (id) DO NOTHING", async () => {
    // Випадковий id дав би на кожному ретраї другу сходинку з тими самими
    // числами — журнал НАМІРУ перестав би бути журналом наміру.
    const fake = new FakeClient();
    await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries[0]!.sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it("НЕ читає існуючий рядок — LWW-guard-а тут немає за задумом", async () => {
    // Сусідній `applyNutritionPrefs` спершу SELECT-ить `updated_at` і може
    // віддати `lww_conflict`. Для append-only ряду це неправильно, і
    // єдиний запит на шляху insert — це доказ.
    const fake = new FakeClient();
    await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries.filter((q) => /SELECT/.test(q.sql))).toHaveLength(0);
  });

  it("дві конкурентні сходинки з різних пристроїв ОБИДВІ applied", async () => {
    // Телефон у вівторок 2200, ноутбук у четвер 1800 — це історія, а не
    // конфлікт. LWW-шлях залишив би одну і стер би другу.
    const fake = new FakeClient();
    const a = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow({ id: "gp::a", effective_from: "2026-07-21", kcal: 2200 })),
      USER,
      CLIENT_TS,
    );
    const b = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow({ id: "gp::b", effective_from: "2026-07-23", kcal: 1800 })),
      USER,
      new Date(CLIENT_TS.getTime() - 60_000), // СТАРІШИЙ clientTs
    );
    expect(a).toEqual({ status: "applied" });
    expect(b).toEqual({ status: "applied" });
  });

  it("зберігає всі п'ять значень і origin у параметрах", async () => {
    const fake = new FakeClient();
    await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    const params = fake.queries[0]!.params;
    expect(params).toEqual([
      "gp::2026-07-25::1800:140:55:180:2500::device-a",
      USER,
      "2026-07-25",
      1800,
      140,
      55,
      180,
      2500,
      "manual",
      new Date("2026-07-25T07:00:00.000Z"),
      CLIENT_TS,
      null,
    ]);
  });

  it("пропускає null-цілі як null, а не як 0", async () => {
    // «Ціль не задана» ≠ «ціль нуль»: друге пофарбувало б кожен день у
    // провал після майбутнього cutover-у.
    const fake = new FakeClient();
    await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow({ kcal: null, protein_g: null })),
      USER,
      CLIENT_TS,
    );
    const params = fake.queries[0]!.params;
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
  });

  it("дефолтить origin у 'manual', коли клієнт його не прислав", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["origin"];
    await applyNutritionGoalPeriods(asClient(fake), op(row), USER, CLIENT_TS);
    expect(fake.queries[0]!.params[8]).toBe("manual");
  });
});

describe("applyNutritionGoalPeriods — append-only інваріант", () => {
  it("відхиляє op='update' з append_only_violation", async () => {
    // Виправлення — це НОВА сходинка, а не редагування старої.
    const fake = new FakeClient();
    const res = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow(), "update"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({
      status: "rejected",
      reason: "append_only_violation",
    });
    expect(fake.queries).toHaveLength(0);
  });

  it("op='delete' ставить ЛИШЕ tombstone, не видаляє рядок", async () => {
    const fake = new FakeClient().enqueue({ rows: [], rowCount: 1 });
    const res = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "applied" });
    expect(fake.queries[0]!.sql).toMatch(/UPDATE nutrition_goal_periods/);
    expect(fake.queries[0]!.sql).toMatch(/SET deleted_at/);
    expect(fake.queries[0]!.sql).not.toMatch(/DELETE FROM/);
  });

  it("повторна ретракція живого-вже-мертвого рядка — applied, не помилка", async () => {
    const fake = new FakeClient()
      .enqueue({ rows: [], rowCount: 0 })
      .enqueue({ rows: [{ user_id: USER }] });
    const res = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "applied" });
  });

  it("ретракція неіснуючого періоду — not_found", async () => {
    const fake = new FakeClient()
      .enqueue({ rows: [], rowCount: 0 })
      .enqueue({ rows: [] });
    const res = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "not_found" });
  });

  it("ретракція чужого періоду — fk_violation", async () => {
    const fake = new FakeClient()
      .enqueue({ rows: [], rowCount: 0 })
      .enqueue({ rows: [{ user_id: "someone-else" }] });
    const res = await applyNutritionGoalPeriods(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "fk_violation" });
  });
});

describe("applyNutritionGoalPeriods — валідація", () => {
  it("відхиляє рядок без id", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["id"];
    expect(
      await applyNutritionGoalPeriods(asClient(fake), op(row), USER, CLIENT_TS),
    ).toEqual({ status: "rejected", reason: "missing_id" });
  });

  it("відхиляє чужий user_id", async () => {
    const fake = new FakeClient();
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ user_id: "other" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("відхиляє ISO-instant у effective_from — потрібен day key", async () => {
    // Клієнт з іншою доктриною часу зсунув би сходинку на добу.
    const fake = new FakeClient();
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ effective_from: "2026-07-25T08:00:00.000Z" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "missing_date_key" });
  });

  it("відхиляє відсутній effective_from", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["effective_from"];
    expect(
      await applyNutritionGoalPeriods(asClient(fake), op(row), USER, CLIENT_TS),
    ).toEqual({ status: "rejected", reason: "missing_date_key" });
  });

  it("відхиляє чужий origin з invalid_goal_origin", async () => {
    const fake = new FakeClient();
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ origin: "vibes" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_goal_origin" });
  });

  it("приймає 'backfill' як валідний origin", async () => {
    const fake = new FakeClient();
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ origin: "backfill" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "applied" });
  });

  it("відхиляє сміття в числових полях з полевим reason", async () => {
    const fake = new FakeClient();
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ kcal: "не число" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_kcal" });
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ protein_g: {} })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_protein_g" });
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ water_ml: "багато" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_qty" });
  });

  it("відхиляє зіпсований created_at", async () => {
    const fake = new FakeClient();
    expect(
      await applyNutritionGoalPeriods(
        asClient(fake),
        op(validRow({ created_at: "вчора" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_created_at" });
  });
});
