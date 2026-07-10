/**
 * SQL-snapshot gate — ADR-0073 Крок 0.
 *
 * Фіксує байт-точну послідовність `(sql, params)`, яку fizruk-адаптер
 * виконує для канонічного набору операцій (по одній кожного kind).
 * Це специфікація поведінки пайплайна ПЕРЕД міграцією на
 * `@sergeant/dualwrite-core`: міграційні PR-и (Кроки 2-9) мають лишати
 * цей snapshot незмінним. Якщо snapshot змінився — це зміна семантики,
 * а не рефакторинг; такий diff дозволено ТІЛЬКИ в окремому
 * semantic-change PR з явним поясненням (див. ADR-0073 § Міграційний
 * план і § Ризики).
 *
 * Пайплайн best-effort (ADR-0073 Open Question #1): адаптер застосовує
 * кожен op незалежно, БЕЗ транзакційного обгортання. Тому recording-клієнт
 * не бачить жодного `exec("BEGIN")` / `exec("COMMIT")` — специфікація
 * складається виключно з `run`-виклик(ів) per-op.
 *
 * AI-DANGER: не оновлюй `__snapshots__/adapter.snapshot.test.ts.snap`
 * «щоб тест пройшов» — розберись, чому SQL змінився.
 */
import { describe, expect, it, vi } from "vitest";
import { applyFizrukDualWriteOps } from "./adapter";
import type { FizrukDualWriteOp } from "./diff/index.js";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

function makeRecordingClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    exec: vi.fn((sql: string) => {
      calls.push({ sql, params: [] });
      return Promise.resolve(undefined);
    }),
    run: vi.fn((sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return Promise.resolve(undefined);
    }),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

const OPTS = { userId: "u1", clientTs: "2026-06-23T00:00:00.000Z" };

/**
 * Канонічна фікстура: рівно один op кожного kind у фіксованому порядку
 * (порядок повторює stable iteration order `diffFizrukDualWriteOps`).
 * Значення довільні, але заморожені — їх зміна теж міняє специфікацію.
 */
const CANONICAL_OPS: FizrukDualWriteOp[] = [
  {
    kind: "workout-upsert",
    workout: {
      id: "w1",
      startedAt: "2026-06-20T08:00:00.000Z",
      endedAt: "2026-06-20T09:00:00.000Z",
      items: [
        {
          id: "i1",
          exerciseId: "bench-press",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: ["chest"],
          musclesSecondary: ["triceps"],
          type: "strength",
          sets: [
            { weightKg: 80, reps: 8 },
            { weightKg: 85, reps: 6, rpe: 8 },
          ],
        },
      ],
      groups: [{ id: "g1", itemIds: ["i1"] }],
      warmup: [{ id: "wu1", done: true, label: "Розминка" }],
      cooldown: [{ id: "cd1", done: false, label: "Заминка" }],
      note: "canonical workout",
    },
  },
  { kind: "workout-delete", workoutId: "w2" },
  {
    kind: "custom-exercise-upsert",
    exercise: { id: "e1", nameUk: "Кастомна вправа", primaryGroup: "back" },
  },
  { kind: "custom-exercise-delete", exerciseId: "e2" },
  {
    kind: "measurement-upsert",
    measurement: { id: "m1", at: "2026-06-20T07:00:00.000Z", weightKg: 82 },
  },
  { kind: "measurement-delete", measurementId: "m2" },
  {
    kind: "daily-log-upsert",
    entry: {
      id: "d1",
      at: "2026-06-20T21:00:00.000Z",
      weightKg: 82.5,
      sleepHours: 7.5,
      energyLevel: 4,
      mood: 3,
      note: "ok",
    },
  },
  { kind: "daily-log-delete", entryId: "d2" },
  {
    kind: "monthly-plan-set",
    monthlyPlan: { dataJson: '{"month":"2026-06"}' },
  },
  {
    kind: "workout-template-upsert",
    template: {
      id: "tpl1",
      name: "Push day",
      exerciseIds: ["bench-press"],
      groups: [],
      updatedAt: "2026-06-20T08:00:00.000Z",
      lastUsedAt: null,
    },
  },
  { kind: "workout-template-delete", templateId: "tpl2" },
];

describe("fizruk dual-write SQL snapshot (ADR-0073 Крок 0)", () => {
  it("emits a byte-stable (sql, params) sequence for the canonical op set", async () => {
    const { client, calls } = makeRecordingClient();

    const result = await applyFizrukDualWriteOps(client, CANONICAL_OPS, OPTS);

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

    await applyFizrukDualWriteOps(first.client, CANONICAL_OPS, OPTS);
    await applyFizrukDualWriteOps(second.client, CANONICAL_OPS, OPTS);

    expect(second.calls).toEqual(first.calls);
  });
});
