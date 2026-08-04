import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { NAME_MAX_LEN } from "@sergeant/shared";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyNutritionPantryEvents } from "./applyPantryEvents.js";

/**
 * W1-PANTRY-APPEND, СТАДІЯ 1 — apply-шлях append-only журналу комори.
 *
 * Головне, що тут фіксується:
 *   1. журнал НЕ редагується (`update` → `append_only_violation`),
 *   2. `delete` — це РЕТРАКЦІЯ (tombstone), а не знищення рядка,
 *   3. повторна доставка тієї самої події не подвоює списання,
 *   4. подія без `delta_qty`/`abs_qty` у журнал не потрапляє,
 *   5. E-7: дві конкурентні події з різних пристроїв обидві застосовані,
 *      жодна не `lww_conflict`.
 */

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];
  /** Черга відповідей на послідовні `query` виклики. */
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
    table: "nutrition_pantry_events",
    row,
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: "test-op",
  } as unknown as SyncV2Op;
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "home::0::молоко|consume|2026-07-25T07:00:00.000Z",
    user_id: USER,
    pantry_id: "home",
    item_id: "home::0::молоко",
    item_key: "молоко",
    kind: "consume",
    delta_qty: -250,
    abs_qty: null,
    unit: "г",
    source: "meal_log",
    meal_id: "meal-1",
    occurred_at: "2026-07-25T07:00:00.000Z",
    created_at: "2026-07-25T07:00:00.000Z",
    ...overrides,
  };
}

describe("applyNutritionPantryEvents — вставка", () => {
  it("вставляє подію через ON CONFLICT (id) DO NOTHING", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );

    expect(res).toEqual({ status: "applied" });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]!.sql).toContain(
      "INSERT INTO nutrition_pantry_events",
    );
    expect(fake.queries[0]!.sql).toContain("ON CONFLICT (id) DO NOTHING");
    // Ніякого SELECT-у «чи є вже рядок» і ніякого LWW-порівняння.
    expect(fake.queries[0]!.sql).not.toContain("SELECT");
    expect(fake.queries[0]!.sql).not.toContain("updated_at >=");
  });

  it("пише user_id із сесії, а не з рядка клієнта", async () => {
    const fake = new FakeClient();
    await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries[0]!.params[1]).toBe(USER);
  });

  it("приймає чекпойнт 'initial' з abs_qty і без delta", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ kind: "initial", delta_qty: null, abs_qty: 1000 })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "applied" });
    expect(fake.queries[0]!.params[7]).toBe(1000);
  });

  it("підставляє clientTs, коли occurred_at не прийшов", async () => {
    const fake = new FakeClient();
    await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ occurred_at: null, created_at: null })),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries[0]!.params[11]).toEqual(CLIENT_TS); // occurred_at
    expect(fake.queries[0]!.params[13]).toEqual(CLIENT_TS); // created_at
  });
});

describe("applyNutritionPantryEvents — tz_offset_min (міграція 109)", () => {
  it("пише tz_offset_min з рядка клієнта, коли він є", async () => {
    const fake = new FakeClient();
    await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ tz_offset_min: -180 })),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries[0]!.params[12]).toBe(-180);
  });

  it("лишає NULL, коли клієнт ще не шле tz_offset_min (старий клієнт)", async () => {
    const fake = new FakeClient();
    await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries[0]!.params[12]).toBeNull();
  });
});

describe("applyNutritionPantryEvents — append-only інваріант", () => {
  it("op='update' відхиляється з append_only_violation", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow(), "update"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({
      status: "rejected",
      reason: "append_only_violation",
    });
    // Жодного запиту до БД — історія навіть не торкнута.
    expect(fake.queries).toHaveLength(0);
  });

  it("op='delete' ставить tombstone, а не видаляє рядок", async () => {
    const fake = new FakeClient().enqueue({ rows: [], rowCount: 1 });
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );

    expect(res).toEqual({ status: "applied" });
    expect(fake.queries).toHaveLength(1);
    const sql = fake.queries[0]!.sql;
    expect(sql).toContain("UPDATE nutrition_pantry_events");
    expect(sql).toContain("SET deleted_at");
    expect(sql).not.toContain("DELETE FROM");
    // Owner-guard прошито у WHERE.
    expect(sql).toContain("user_id = $3");
  });

  it("повторна ретракція вже tombstone-нутої події — ідемпотентний applied", async () => {
    const fake = new FakeClient()
      .enqueue({ rows: [], rowCount: 0 }) // UPDATE нічого не зачепив
      .enqueue({ rows: [{ user_id: USER }] }); // але рядок існує
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "applied" });
  });

  it("ретракція неіснуючої події → not_found", async () => {
    const fake = new FakeClient()
      .enqueue({ rows: [], rowCount: 0 })
      .enqueue({ rows: [] });
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "not_found" });
  });

  it("ретракція чужої події → fk_violation", async () => {
    const fake = new FakeClient()
      .enqueue({ rows: [], rowCount: 0 })
      .enqueue({ rows: [{ user_id: "someone-else" }] });
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow(), "delete"),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "fk_violation" });
  });
});

describe("applyNutritionPantryEvents — валідація", () => {
  it("порожній id → missing_id", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ id: null })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "missing_id" });
  });

  it("чужий user_id → user_id_mismatch", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ user_id: "someone-else" })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("немає pantry_id → missing_pantry_id", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ pantry_id: "" })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "missing_pantry_id" });
  });

  it("невідомий kind → invalid_event_kind", async () => {
    const fake = new FakeClient();
    // 'cook' — гіпотетичний вид зі стадії 5; контракт стадії 1 його не знає.
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ kind: "cook" })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "invalid_event_kind" });
    expect(fake.queries).toHaveLength(0);
  });

  it("consume без delta_qty → missing_delta_or_abs", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ delta_qty: null })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "missing_delta_or_abs" });
  });

  it("adjust без abs_qty → missing_delta_or_abs", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ kind: "adjust", delta_qty: -1, abs_qty: null })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "missing_delta_or_abs" });
  });

  it("adjust з abs_qty = 0 приймається (нуль — це значення, не «пусто»)", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ kind: "adjust", delta_qty: null, abs_qty: 0 })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "applied" });
    expect(fake.queries[0]!.params[7]).toBe(0);
  });

  it("нечислова delta_qty → invalid_qty", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ delta_qty: "багато" })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "invalid_qty" });
  });

  it("немає item_key → відхилено (згортка ключується саме на ньому)", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ item_key: "" })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "missing_id" });
  });

  // Pre-beta input-boundaries audit: item_key is canonicalFoodKey, derived
  // from a user-typed food name — `curl` bypasses the client NAME_MAX_LEN.
  it("item_key довший за NAME_MAX_LEN → text_too_long", async () => {
    const fake = new FakeClient();
    const res = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow({ item_key: "a".repeat(NAME_MAX_LEN + 1) })),
      USER,
      CLIENT_TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "text_too_long" });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("applyNutritionPantryEvents — E-7 (конкурентні пристрої)", () => {
  it("consume з телефону і replenish з десктопу обидва applied, без lww_conflict", async () => {
    // Це рівно той сценарій, який на старому шляху (`applyNutritionPantryItems`,
    // per-row LWW по `qty`) давав `lww_conflict` і тиху втрату однієї
    // операції. Тут події — РІЗНІ рядки, тож конкуренції за рядок немає.
    const fake = new FakeClient();

    const phone = await applyNutritionPantryEvents(
      asClient(fake),
      op(
        validRow({
          id: "evt-phone",
          kind: "consume",
          delta_qty: -250,
          occurred_at: "2026-07-25T07:00:00.000Z",
        }),
      ),
      USER,
      CLIENT_TS,
    );
    const desktop = await applyNutritionPantryEvents(
      asClient(fake),
      op(
        validRow({
          id: "evt-desktop",
          kind: "replenish",
          delta_qty: 1000,
          source: "parse_pantry",
          meal_id: null,
          occurred_at: "2026-07-25T07:00:01.000Z",
        }),
      ),
      USER,
      CLIENT_TS,
    );

    expect(phone).toEqual({ status: "applied" });
    expect(desktop).toEqual({ status: "applied" });
    expect(fake.queries).toHaveLength(2);
    for (const q of fake.queries) {
      expect(q.sql).not.toContain("lww");
      expect(q.sql).toContain("ON CONFLICT (id) DO NOTHING");
    }
    // Обидві події лягли в журнал під власними id — жодна не перезаписала іншу.
    expect(fake.queries.map((q) => q.params[0])).toEqual([
      "evt-phone",
      "evt-desktop",
    ]);
  });

  it("подвійна доставка тієї самої події не подвоює списання", async () => {
    const fake = new FakeClient();
    const first = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    const retry = await applyNutritionPantryEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );

    expect(first).toEqual({ status: "applied" });
    // Ідемпотентний повтор теж `applied`: клієнту важливо прибрати рядок
    // із черги, а не дізнатись, чий саме push його створив.
    expect(retry).toEqual({ status: "applied" });
    // Дедуплікацію робить БД через ON CONFLICT — обидва запити однакові.
    expect(fake.queries[0]!.params[0]).toBe(fake.queries[1]!.params[0]);
    expect(fake.queries[1]!.sql).toContain("ON CONFLICT (id) DO NOTHING");
  });
});
