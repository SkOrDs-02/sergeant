/**
 * SQL-snapshot gate — ADR-0073 Крок 0.
 *
 * Фіксує байт-точну послідовність `(sql, params)`, яку finyk-адаптер
 * виконує для канонічного набору операцій (по одній кожного kind).
 * Це специфікація поведінки пайплайна ПЕРЕД міграцією на
 * `@sergeant/dualwrite-core`: міграційні PR-и (Кроки 2-9) мають лишати
 * цей snapshot незмінним. Якщо snapshot змінився — це зміна семантики,
 * а не рефакторинг; такий diff дозволено ТІЛЬКИ в окремому
 * semantic-change PR з явним поясненням (див. ADR-0073 § Міграційний
 * план і § Ризики).
 *
 * AI-DANGER: не оновлюй `__snapshots__/adapter.snapshot.test.ts.snap`
 * «щоб тест пройшов» — розберись, чому SQL змінився.
 */
import { describe, expect, it, vi } from "vitest";
import { applyFinykDualWriteOps } from "./adapter";
import type { FinykDualWriteOp } from "./diff";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

function makeRecordingClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    run: vi.fn((sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return Promise.resolve(undefined);
    }),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

const OPTS = { userId: "u1", clientTs: "2026-06-23T00:00:00.000Z" };

/**
 * Канонічна фікстура: рівно один op кожного kind у фіксованому порядку.
 * Значення довільні, але заморожені — їх зміна теж міняє специфікацію.
 */
const CANONICAL_OPS: FinykDualWriteOp[] = [
  {
    kind: "id-upsert",
    table: "finyk_hidden_accounts",
    entry: { id: "acc1" },
  },
  { kind: "id-delete", table: "finyk_hidden_transactions", id: "tx1" },
  {
    kind: "blob-upsert",
    table: "finyk_budgets",
    entry: { id: "b1", dataJson: '{"x":1}' },
  },
  { kind: "blob-delete", table: "finyk_budgets", id: "b1" },
  {
    kind: "tx-category-upsert",
    entry: { transactionId: "t1", categoryId: "food" },
  },
  { kind: "tx-category-delete", transactionId: "t1" },
  {
    kind: "tx-splits-upsert",
    entry: { transactionId: "t2", splitsJson: "[]" },
  },
  { kind: "tx-splits-delete", transactionId: "t2" },
  {
    kind: "mono-debt-link-upsert",
    entry: { transactionId: "t3", debtIdsJson: "[]" },
  },
  { kind: "mono-debt-link-delete", transactionId: "t3" },
  {
    kind: "networth-upsert",
    entry: { month: "2026-06", networth: 1000 },
  },
  {
    kind: "prefs-upsert",
    prefs: {
      monthlyPlanJson: "{}",
      showBalance: true,
      excludedStatTxIdsJson: "[]",
      dismissedRecurringJson: "[]",
    },
  },
];

describe("finyk dual-write SQL snapshot (ADR-0073 Крок 0)", () => {
  it("emits a byte-stable (sql, params) sequence for the canonical op set", async () => {
    const { client, calls } = makeRecordingClient();

    const result = await applyFinykDualWriteOps(client, CANONICAL_OPS, OPTS);

    expect(result).toEqual({
      applied: CANONICAL_OPS.length,
      errored: 0,
      skipped: 0,
    });
    expect(calls).toMatchSnapshot();
  });

  it("is deterministic — a second run over the same ops emits the identical sequence", async () => {
    const first = makeRecordingClient();
    const second = makeRecordingClient();

    await applyFinykDualWriteOps(first.client, CANONICAL_OPS, OPTS);
    await applyFinykDualWriteOps(second.client, CANONICAL_OPS, OPTS);

    expect(second.calls).toEqual(first.calls);
  });
});
