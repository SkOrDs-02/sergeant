import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyRoutineCompletionEvents } from "./applyCompletionEvents.js";

/**
 * W1-ROUTINE-APPEND, СТАДІЯ 1 — apply-шлях append-only журналу.
 *
 * Головне, що тут фіксується: журнал НЕ редагується. `update` / `delete`
 * відхиляються з окремою причиною, а не «майже застосовуються».
 */

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ sql, params });
    return { rows: [] };
  }
}

function asClient(fake: FakeClient): PoolClient {
  return fake as unknown as PoolClient;
}

const CLIENT_TS = new Date("2026-07-21T08:00:00.000Z");
const USER = "user-1";

function op(
  row: Record<string, unknown>,
  kind: SyncV2Op["op"] = "insert",
): SyncV2Op {
  return {
    op: kind,
    table: "routine_completion_events",
    row,
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: "test-op",
  } as unknown as SyncV2Op;
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "hab_1|2026-07-20|2026-07-20T09:00:00.000Z|done|dev-a",
    user_id: USER,
    habit_id: "hab_1",
    date_key: "2026-07-20",
    state: "done",
    occurred_at: "2026-07-20T09:00:00.000Z",
    tz_offset_min: 180,
    day_anchor: "device-local",
    source: "ui",
    device_id: "dev-a",
    created_at: "2026-07-20T09:00:00.000Z",
    ...overrides,
  };
}

describe("applyRoutineCompletionEvents", () => {
  it("вставляє подію через ON CONFLICT (id) DO NOTHING", async () => {
    const fake = new FakeClient();
    const result = await applyRoutineCompletionEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "applied" });
    expect(fake.queries).toHaveLength(1);
    const q = fake.queries[0]!;
    expect(q.sql).toMatch(/INSERT INTO routine_completion_events/);
    expect(q.sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    // Ніяких UPDATE / DELETE / SELECT-guard-ів — append-only.
    expect(q.sql).not.toMatch(/DO UPDATE/);
    expect(q.params[0]).toBe(
      "hab_1|2026-07-20|2026-07-20T09:00:00.000Z|done|dev-a",
    );
    expect(q.params[1]).toBe(USER);
    expect(q.params[4]).toBe("done");
  });

  it("не робить LWW-SELECT — подія незмінна, порівнювати нема з чим", async () => {
    const fake = new FakeClient();
    await applyRoutineCompletionEvents(
      asClient(fake),
      op(validRow()),
      USER,
      CLIENT_TS,
    );
    expect(fake.queries.filter((q) => /^\s*SELECT/i.test(q.sql))).toHaveLength(
      0,
    );
  });

  it.each(["update", "delete"] as const)(
    "відхиляє op=%s з append_only_violation і НЕ торкається БД",
    async (kind) => {
      const fake = new FakeClient();
      const result = await applyRoutineCompletionEvents(
        asClient(fake),
        op(validRow(), kind),
        USER,
        CLIENT_TS,
      );
      expect(result).toEqual({
        status: "rejected",
        reason: "append_only_violation",
      });
      expect(fake.queries).toHaveLength(0);
    },
  );

  it("відхиляє чужий user_id раніше за DML", async () => {
    const fake = new FakeClient();
    expect(
      await applyRoutineCompletionEvents(
        asClient(fake),
        op(validRow({ user_id: "someone-else" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("відхиляє відсутній user_id / id / habit_id / date_key", async () => {
    const fake = new FakeClient();
    const cases: Array<[Record<string, unknown>, string]> = [
      [validRow({ user_id: null }), "missing_user_id"],
      [validRow({ id: 42 }), "missing_id"],
      [validRow({ habit_id: null }), "missing_id"],
      [validRow({ date_key: undefined }), "missing_date_key"],
    ];
    for (const [row, reason] of cases) {
      expect(
        await applyRoutineCompletionEvents(
          asClient(fake),
          op(row),
          USER,
          CLIENT_TS,
        ),
      ).toEqual({ status: "rejected", reason });
    }
    expect(fake.queries).toHaveLength(0);
  });

  it("відхиляє бите occurred_at / created_at", async () => {
    const fake = new FakeClient();
    expect(
      await applyRoutineCompletionEvents(
        asClient(fake),
        op(validRow({ occurred_at: "not-a-date" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_created_at" });
    expect(
      await applyRoutineCompletionEvents(
        asClient(fake),
        op(validRow({ created_at: "not-a-date" })),
        USER,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_created_at" });
    expect(fake.queries).toHaveLength(0);
  });

  it("нормалізує невідомий state у 'done', а невідомий day_anchor/source — у дефолти", async () => {
    const fake = new FakeClient();
    await applyRoutineCompletionEvents(
      asClient(fake),
      op(
        validRow({
          state: "wat",
          day_anchor: 7,
          source: null,
          tz_offset_min: 1.5,
          device_id: 9,
        }),
      ),
      USER,
      CLIENT_TS,
    );
    const params = fake.queries[0]!.params;
    expect(params[4]).toBe("done");
    expect(params[6]).toBeNull(); // tz_offset_min: не ціле → null
    expect(params[7]).toBe("unknown");
    expect(params[8]).toBe("ui");
    expect(params[9]).toBeNull(); // device_id: не рядок → null
  });

  it("падає назад на clientTs, коли занадто короткий payload без таймстемпів", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["occurred_at"];
    delete (row as Record<string, unknown>)["created_at"];
    await applyRoutineCompletionEvents(
      asClient(fake),
      op(row),
      USER,
      CLIENT_TS,
    );
    const params = fake.queries[0]!.params;
    expect(params[5]).toEqual(CLIENT_TS);
    expect(params[10]).toEqual(CLIENT_TS);
  });
});
