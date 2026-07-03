/**
 * SQL-snapshot gate — ADR-0073 Крок 0 (mobile).
 *
 * Фіксує байт-точну послідовність `(sql, params)`, яку mobile-routine-адаптер
 * виконує для канонічного набору операцій (по одній кожного kind).
 * Це специфікація поведінки пайплайна ПЕРЕД міграцією на
 * `@sergeant/dualwrite-core`: міграційні PR-и (Кроки 2-9) мають лишати
 * цей snapshot незмінним. Якщо snapshot змінився — це зміна семантики,
 * а не рефакторинг; такий diff дозволено ТІЛЬКИ в окремому
 * semantic-change PR з явним поясненням (див. ADR-0073 § Міграційний
 * план і § Ризики).
 *
 * Дзеркало канонічного веб-гейта
 * `apps/web/src/modules/finyk/lib/dualWrite/adapter.snapshot.test.ts`,
 * адаптоване під Jest (mobile-рig) замість Vitest. У `habit-upsert`
 * поле `createdAt` заморожене явно, щоб не спрацьовував fallback
 * `h.createdAt ?? clientTs` — обидві гілки детерміновані, але явне
 * значення робить фікстуру самодокументованою.
 *
 * AI-DANGER: не оновлюй `__snapshots__/adapter.snapshot.test.ts.snap`
 * «щоб тест пройшов» — розберись, чому SQL змінився.
 */
import { applyRoutineDualWriteOps } from "./adapter";
import type { RoutineDualWriteOp } from "./diff";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

function makeRecordingClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    run: jest.fn((sql: string, params?: readonly unknown[]) => {
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
const CANONICAL_OPS: RoutineDualWriteOp[] = [
  {
    kind: "completion-add",
    habitId: "h1",
    habitName: "Вода",
    dateKey: "2026-06-22",
  },
  { kind: "completion-remove", habitId: "h1", dateKey: "2026-06-21" },
  {
    kind: "habit-rename",
    habitId: "h1",
    prevName: "Вода",
    nextName: "Вода 2л",
  },
  {
    kind: "habit-upsert",
    habit: {
      id: "h1",
      name: "Вода 2л",
      emoji: "💧",
      tagIds: ["tag1"],
      categoryId: "cat1",
      archived: false,
      paused: false,
      recurrence: "daily",
      startDate: "2026-06-01",
      endDate: null,
      timeOfDay: "morning",
      reminderTimes: ["08:00"],
      weekdays: [1, 2, 3, 4, 5],
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  },
  { kind: "habit-delete", habitId: "h1" },
  { kind: "tag-upsert", tag: { id: "tag1", name: "здоровʼя", scope: "" } },
  { kind: "tag-delete", tagId: "tag1" },
  {
    kind: "category-upsert",
    category: { id: "cat1", name: "Ранок", emoji: "🌅" },
  },
  { kind: "category-delete", categoryId: "cat1" },
  { kind: "prefs-set", prefs: { weekStart: "monday" } },
  { kind: "pushup-upsert", dateKey: "2026-06-22", reps: 40 },
  { kind: "habit-order-set", orderedIds: ["h1", "h2"] },
  {
    kind: "completion-note-upsert",
    noteKey: "h1:2026-06-22",
    note: "легко",
  },
  { kind: "completion-note-delete", noteKey: "h1:2026-06-21" },
] as never;

describe("mobile routine dual-write SQL snapshot (ADR-0073 Крок 0)", () => {
  it("emits a byte-stable (sql, params) sequence for the canonical op set", async () => {
    const { client, calls } = makeRecordingClient();

    const result = await applyRoutineDualWriteOps(client, CANONICAL_OPS, OPTS);

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

    await applyRoutineDualWriteOps(first.client, CANONICAL_OPS, OPTS);
    await applyRoutineDualWriteOps(second.client, CANONICAL_OPS, OPTS);

    expect(second.calls).toEqual(first.calls);
  });
});
