/** @vitest-environment jsdom */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";

import {
  FK_REQUEUE_MAX_RUNS,
  FK_REQUEUE_MIN_GAP_MS,
  FK_REQUEUE_STATE_KEY,
  FK_REQUEUE_WINDOW_MS,
  requeueFkViolationRejected,
} from "./requeueFkViolationRejected";

const USER = "user-1";
const T0 = 1_800_000_000_000;
const H = FK_REQUEUE_MIN_GAP_MS;

function makeClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

interface Row {
  id: number;
  status: string;
  reject_reason: string | null;
  idempotency_key: string;
  attempts: number;
  row: string;
  client_ts: string;
}

let db: BetterSqliteDatabase;
let client: SqliteMigrationClient;

function insert(status: string, reason: string | null, key: string): number {
  const info = db
    .prepare(
      `INSERT INTO sync_op_outbox
         (user_id, table_name, op, row, client_ts, idempotency_key, status, reject_reason, attempts, last_error)
       VALUES (?, 'nutrition_pantry_events', 'insert', '{"id":"pe::initial::home::milk"}',
               '2026-10-01T10:00:00.000Z', ?, ?, ?, 5, 'x')`,
    )
    .run(USER, key, status, reason);
  return Number(info.lastInsertRowid);
}

function get(id: number): Row | undefined {
  return db.prepare(`SELECT * FROM sync_op_outbox WHERE id = ?`).get(id) as
    Row | undefined;
}

/** Імітує відмову сервера: pending -> rejected(fk_violation). */
function serverRejectsAgain(id: number): void {
  db.prepare(
    `UPDATE sync_op_outbox SET status='rejected', reject_reason='fk_violation' WHERE id = ?`,
  ).run(id);
}

beforeEach(async () => {
  window.localStorage.clear();
  db = new Database(":memory:");
  client = makeClient(db);
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: ROUTINE_CLIENT_MIGRATIONS,
    tableName: ROUTINE_MIGRATIONS_TABLE,
  });
});

afterEach(() => {
  db.close();
  window.localStorage.clear();
});

describe("requeueFkViolationRejected", () => {
  it("перепоставляє лише rejected/fk_violation: новий ключ, payload і client_ts ті самі", async () => {
    const fk = insert("rejected", "fk_violation", "old-key");
    const other = insert("rejected", "invalid_text_encoding", "k2");
    const quarantined = insert("quarantined", "fk_violation", "k3");
    const dead = insert("dead_letter", null, "k4");

    const res = await requeueFkViolationRejected(client, T0);

    expect(res).toEqual({ requeued: 1, outcome: "requeued" });
    const row = get(fk)!;
    expect(row.status).toBe("pending");
    expect(row.reject_reason).toBeNull();
    expect(row.attempts).toBe(0);
    expect(row.idempotency_key).not.toBe("old-key");
    expect(row.row).toBe('{"id":"pe::initial::home::milk"}');
    expect(row.client_ts).toBe("2026-10-01T10:00:00.000Z");
    expect(get(other)!.status).toBe("rejected");
    expect(get(quarantined)!.status).toBe("quarantined");
    expect(get(dead)!.status).toBe("dead_letter");
  });

  it("порядок деплою: старий сервер знову відхиляє - маркер НЕ ставиться, наступна спроба пізніше", async () => {
    const id = insert("rejected", "fk_violation", "k");
    await requeueFkViolationRejected(client, T0);
    serverRejectsAgain(id); // бекенд ще старий

    // Той самий бут/година: не чіпаємо (немає петлі).
    expect((await requeueFkViolationRejected(client, T0 + 1000)).outcome).toBe(
      "waiting",
    );
    expect(get(id)!.status).toBe("rejected");

    // Бекенд викотився, наступна спроба за годину: рядок піде, сервер прийме.
    const second = await requeueFkViolationRejected(client, T0 + H);
    expect(second.outcome).toBe("requeued");
    db.prepare(`DELETE FROM sync_op_outbox WHERE id = ?`).run(id); // applied

    expect((await requeueFkViolationRejected(client, T0 + 2 * H)).outcome).toBe(
      "done",
    );
    // Готово остаточно.
    insert("rejected", "fk_violation", "later");
    expect((await requeueFkViolationRejected(client, T0 + 3 * H)).outcome).toBe(
      "done",
    );
  });

  it("не чіпає рядки в польоті (pending) і чекає", async () => {
    const id = insert("rejected", "fk_violation", "k");
    await requeueFkViolationRejected(client, T0);
    const res = await requeueFkViolationRejected(client, T0 + 10 * H);
    expect(res.outcome).toBe("waiting");
    expect(get(id)!.status).toBe("pending");
  });

  it("термінальні (чужий батько) повторюються не більше MAX_RUNS разів, далі лишаються rejected", async () => {
    const id = insert("rejected", "fk_violation", "k");
    let now = T0;
    for (let i = 0; i < FK_REQUEUE_MAX_RUNS; i++) {
      expect((await requeueFkViolationRejected(client, now)).outcome).toBe(
        "requeued",
      );
      serverRejectsAgain(id);
      now += H;
    }
    expect((await requeueFkViolationRejected(client, now)).outcome).toBe(
      "done",
    );
    expect(get(id)!.status).toBe("rejected");
    expect((await requeueFkViolationRejected(client, now + H)).outcome).toBe(
      "done",
    );
  });

  it("без відхилених рядків чекає вікно (відмова старого сервера може прийти пізніше), потім згасає", async () => {
    expect((await requeueFkViolationRejected(client, T0)).outcome).toBe("idle");
    const id = insert("rejected", "fk_violation", "late");
    expect((await requeueFkViolationRejected(client, T0 + H)).outcome).toBe(
      "requeued",
    );
    expect(get(id)!.status).toBe("pending");

    window.localStorage.removeItem(FK_REQUEUE_STATE_KEY);
    db.prepare(`DELETE FROM sync_op_outbox`).run();
    await requeueFkViolationRejected(client, T0);
    expect(
      (await requeueFkViolationRejected(client, T0 + FK_REQUEUE_WINDOW_MS + 1))
        .outcome,
    ).toBe("done");
  });
});
