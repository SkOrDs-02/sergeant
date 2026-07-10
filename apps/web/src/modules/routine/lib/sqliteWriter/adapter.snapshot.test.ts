/**
 * SQL-snapshot gate — ADR-0073 Крок 0.
 *
 * Фіксує байт-точну послідовність `(sql, params)`, яку routine-адаптер
 * виконує для канонічного набору операцій (по одній кожного kind).
 * Це специфікація поведінки пайплайна ПЕРЕД міграцією на
 * `@sergeant/dualwrite-core`: міграційні PR-и (Кроки 2-9) мають лишати
 * цей snapshot незмінним. Якщо snapshot змінився — це зміна семантики,
 * а не рефакторинг; такий diff дозволено ТІЛЬКИ в окремому
 * semantic-change PR з явним поясненням (див. ADR-0073 § Міграційний
 * план і § Ризики).
 *
 * Знахідки Кроку 0 (недетермінізм усередині адаптера):
 *
 * 1. `completion-add` / `completion-remove` викликають
 *    `enqueueOutboxUpsert` з `idempotencyKey: crypto.randomUUID()` —
 *    адаптер сам штампує випадкове значення. Щоб snapshot був
 *    байт-стабільним, тест детерміністично стабить `crypto.randomUUID`
 *    (лічильник, скидається перед кожним прогоном). Це НЕ прибирає
 *    недетермінізм із продакшн-коду — міграція на `dualwrite-core` має
 *    винести генерацію ключа в injectable-залежність.
 * 2. Outbox-enqueue — fire-and-forget (`void enqueueOutboxUpsert(...)`),
 *    тому його SQL-виклики не покриті `await` адаптера і їхнє місце в
 *    послідовності залежить від microtask-scheduler-а. Тест явно
 *    дочікує чергу (`flushAsyncWork`) перед assert-ом; сама
 *    interleaving-послідовність зафіксована snapshot-ом і може
 *    зміститися від семантично-нейтрального рефакторингу (додатковий
 *    `await`) — це очікувана чутливість гейта.
 *
 * AI-DANGER: не оновлюй `__snapshots__/adapter.snapshot.test.ts.snap`
 * «щоб тест пройшов» — розберись, чому SQL змінився.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRoutineDualWriteOps } from "./adapter";
import type { RoutineDualWriteOp } from "./diff.js";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

function makeRecordingClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    run: vi.fn((sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return Promise.resolve(undefined);
    }),
    // Read-шлях `enqueueOutboxUpsert` (pre/post-check по idempotency_key).
    // Повертаємо [] — pre-check проходить і INSERT в outbox записується;
    // post-check після цього кидає помилку, яку адаптер свідомо ковтає
    // (fire-and-forget). SELECT-и не записуємо: гейт фіксує write-шлях.
    all: vi.fn(() => Promise.resolve([])),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

/**
 * Детерміністичний стаб `crypto.randomUUID` — див. знахідку №1 у шапці.
 * Кожен виклик встановлює СВІЖИЙ лічильник, щоб обидва прогони
 * determinism-тесту давали ідентичну послідовність ключів.
 */
function stubDeterministicUuids(): void {
  let n = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
    n += 1;
    return toUuid(n);
  });
}

function toUuid(n: number): ReturnType<Crypto["randomUUID"]> {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Дочікує fire-and-forget outbox-ланцюжки — див. знахідку №2 у шапці. */
function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const OPTS = { userId: "u1", clientTs: "2026-06-23T00:00:00.000Z" };

/**
 * Канонічна фікстура: по одному op кожного kind у фіксованому порядку
 * (порядок повторює switch адаптера). Виняток — `habit-upsert` двічі:
 * з `createdAt` і без, щоб зафіксувати обидві гілки семантики
 * `h.createdAt ?? clientTs` для `created_at`.
 * Значення довільні, але заморожені — їх зміна теж міняє специфікацію.
 */
const CANONICAL_OPS: RoutineDualWriteOp[] = [
  {
    kind: "completion-add",
    habitId: "h1",
    habitName: "Пити воду",
    dateKey: "2026-06-20",
  },
  { kind: "completion-remove", habitId: "h1", dateKey: "2026-06-19" },
  {
    kind: "habit-rename",
    habitId: "h1",
    prevName: "Пити воду",
    nextName: "Пити 2л води",
  },
  {
    kind: "habit-upsert",
    habit: {
      id: "h1",
      name: "Пити 2л води",
      emoji: "💧",
      tagIds: ["t1"],
      categoryId: "c1",
      createdAt: "2026-06-01T00:00:00.000Z",
      archived: false,
      paused: false,
      recurrence: "daily",
      startDate: "2026-06-01",
      endDate: null,
      timeOfDay: "morning",
      reminderTimes: ["08:00"],
      weekdays: [1, 2, 3, 4, 5],
    },
  },
  // Гілка `h.createdAt ?? clientTs`: habit БЕЗ createdAt (і без решти
  // optional-полів — фіксує всі `??`-fallback-и адаптера).
  { kind: "habit-upsert", habit: { id: "h2", name: "Читати" } },
  { kind: "habit-delete", habitId: "h3" },
  { kind: "tag-upsert", tag: { id: "t1", name: "ранок" } },
  { kind: "tag-delete", tagId: "t2" },
  {
    kind: "category-upsert",
    category: { id: "c1", name: "Здоров'я", emoji: "🏥" },
  },
  { kind: "category-delete", categoryId: "c2" },
  {
    kind: "prefs-set",
    prefs: { showFizrukInCalendar: true, routineRemindersEnabled: false },
  },
  { kind: "pushup-upsert", dateKey: "2026-06-20", reps: 30 },
  { kind: "habit-order-set", orderedIds: ["h2", "h1"] },
  {
    kind: "completion-note-upsert",
    noteKey: "h1__2026-06-20",
    note: "вдалося",
  },
  { kind: "completion-note-delete", noteKey: "h1__2026-06-19" },
];

describe("routine dual-write SQL snapshot (ADR-0073 Крок 0)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a byte-stable (sql, params) sequence for the canonical op set", async () => {
    stubDeterministicUuids();
    const { client, calls } = makeRecordingClient();

    const result = await applyRoutineDualWriteOps(client, CANONICAL_OPS, OPTS);
    await flushAsyncWork();

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

    stubDeterministicUuids();
    await applyRoutineDualWriteOps(first.client, CANONICAL_OPS, OPTS);
    await flushAsyncWork();

    stubDeterministicUuids();
    await applyRoutineDualWriteOps(second.client, CANONICAL_OPS, OPTS);
    await flushAsyncWork();

    expect(second.calls).toEqual(first.calls);
  });
});
