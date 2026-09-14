import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { __anonymousMigrationInternals } from "./anonymousDataMigration.js";

const item = {
  table: "finyk_prefs",
  row: {
    user_id: "local-anon",
    prefs_json: '{"currency":"UAH"}',
    updated_at: "2026-07-28T08:00:00.000Z",
  },
  primaryKey: ["user_id"],
  clientTs: "2026-07-28T08:00:00.000Z",
};

describe("anonymous data migration invariants", () => {
  it("builds a stable, server-safe idempotency key and decodes JSON columns", async () => {
    const first = await __anonymousMigrationInternals.idempotencyKey(
      "batch-1",
      "opaque-user-1",
      item,
    );
    const second = await __anonymousMigrationInternals.idempotencyKey(
      "batch-1",
      "opaque-user-1",
      item,
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^anonv1_[a-f0-9]{48}$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(__anonymousMigrationInternals.decodeJsonColumns(item.row)).toEqual({
      ...item.row,
      prefs_json: { currency: "UAH" },
    });
  });

  it("does not accept a pending outbox row as server-confirmed", async () => {
    const client = {
      all: vi.fn(async () => [
        { id: 1, status: "pending", reject_reason: null },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await expect(
      __anonymousMigrationInternals.assertServerAcknowledged(client, [
        "anonv1_pending",
      ]),
      // Повідомлення тепер несе крок і числа — саме воно їде і в Sentry, і
      // на екран збою, тож перевіряємо форму, а не тільки факт кидка.
    ).rejects.toThrow("anon-migration/confirm: 1/1 unsettled");
    expect(client.run).not.toHaveBeenCalled();
  });

  // Регресія 2026-09-13 (звіт власника: «Не вдалося завершити перенесення»
  // двічі з різницею у пів години, обидва рази на LTE з повним сигналом).
  // Один `flushNow()` — це РІВНО ОДИН тік push-лупа, а тік бере з черги
  // `LIMIT 100`. Тож перенос профілю з понад 100 анонімними рядками падав
  // детерміновано: перші 100 їхали, решта лишалась `pending`. Повтор
  // упирався в ту саму стелю, тому мережа тут ні до чого.
  it("жене чергу по батчах, доки наші рядки не вирішені", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => `anonv1_op${i}`);
    // Модель черги: тік прибирає рівно 100 рядків, як реальний drain.
    let pending = keys.length;
    const client = {
      all: vi.fn(async () =>
        Array.from({ length: pending }, (_, i) => ({
          id: i,
          status: "pending",
          reject_reason: null,
        })),
      ),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    const flushNow = vi.fn(async () => {
      pending = Math.max(0, pending - 100);
    });

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      keys,
    );

    expect(flushNow).toHaveBeenCalledTimes(3);
    expect(pending).toBe(0);
  });

  // Зворотний бік: зірвана посеред переносу мережа не має крутити цикл
  // вічно. Тік, який не зрушив жодного рядка, зупиняє гонитву — розбір
  // віддається `assertServerAcknowledged` з реальною причиною.
  it("зупиняється після кількох поспіль тіків, що нічого не зрушили", async () => {
    const client = {
      all: vi.fn(async () => [
        { id: 1, status: "pending", reject_reason: null },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    const flushNow = vi.fn(async () => undefined);

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      ["anonv1_stuck"],
    );

    // Терпимість, а не миттєва здача: `flushNow()` приєднується до чужого
    // тіку в польоті й може повернутись без нових рядків на цілком живій
    // мережі. Одноразовий вихід обірвав би перенос саме там.
    expect(flushNow).toHaveBeenCalledTimes(3);
  });

  it("treats an LWW rejection as an authoritative conflict winner", async () => {
    const run = vi.fn(async () => undefined);
    const client = {
      all: vi.fn(async () => [
        { id: 7, status: "rejected", reject_reason: "lww_conflict" },
      ]),
      run,
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await __anonymousMigrationInternals.assertServerAcknowledged(client, [
      "anonv1_conflict",
    ]);
    expect(run).toHaveBeenCalledWith(
      "DELETE FROM sync_op_outbox WHERE id = ?",
      [7],
    );
  });
});
