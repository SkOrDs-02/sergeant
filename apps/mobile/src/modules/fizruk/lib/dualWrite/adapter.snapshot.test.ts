/**
 * SQL-snapshot gate — ADR-0073 Крок 0 (mobile).
 *
 * Фіксує байт-точну послідовність `(sql, params)`, яку mobile-fizruk-адаптер
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
 * адаптоване під Jest (mobile-рig) замість Vitest.
 *
 * **KV-шлях (`active-workout-set`).** На mobile активний воркаут НЕ має
 * власної `fizruk_*` таблиці: адаптер пише його у спільну Stage 9
 * таблицю `kv_store` (key `fizruk_active_workout_id_v1`) через ТОЙ САМИЙ
 * `client.run`, причому `updated_at` — це `Date.parse(clientTs)` в
 * epoch-мілісекундах (INTEGER), а не ISO-рядок. Тому окремий KV-fake не
 * потрібен: KV-side effect потрапляє у ту саму впорядковану
 * послідовність `(sql, params)` і пінитьcя цим snapshot-ом разом з
 * рештою ops — включно з дивергенцією формату `updated_at`
 * (`1782172800000` для замороженого `clientTs`).
 *
 * `workout-upsert` навмисно містить один item з одним set-ом — це
 * пінить каскад parent → item → set та обидві cleanup-гілки `NOT IN (…)`.
 *
 * AI-DANGER: не оновлюй `__snapshots__/adapter.snapshot.test.ts.snap`
 * «щоб тест пройшов» — розберись, чому SQL змінився.
 */
import { applyFizrukDualWriteOps } from "./adapter";
import type { FizrukDualWriteOp } from "./diff";
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
const CANONICAL_OPS: FizrukDualWriteOp[] = [
  {
    kind: "workout-upsert",
    workout: {
      id: "w1",
      startedAt: "2026-06-22T10:00:00.000Z",
      endedAt: "2026-06-22T11:00:00.000Z",
      note: "спина",
      groups: [],
      warmup: null,
      cooldown: null,
      items: [
        {
          id: "w1i1",
          exerciseId: "ex-row",
          nameUk: "Тяга",
          primaryGroup: "back",
          musclesPrimary: ["lats"],
          musclesSecondary: [],
          type: "strength",
          sets: [{ weightKg: 60, reps: 10, rpe: 7 }],
        },
      ],
    },
  },
  { kind: "workout-delete", workoutId: "w1" },
  {
    kind: "custom-exercise-upsert",
    exercise: { id: "ce1", nameUk: "Присід", primaryGroup: "legs" },
  },
  { kind: "custom-exercise-delete", exerciseId: "ce1" },
  {
    kind: "measurement-upsert",
    measurement: {
      id: "ms1",
      at: "2026-06-22T07:00:00.000Z",
      weightKg: 80,
      waistCm: 82,
      chestCm: 100,
      hipsCm: 95,
      bicepCm: 36,
      sleepHours: 8,
      energyLevel: 7,
      mood: 4,
    },
  },
  { kind: "measurement-delete", measurementId: "ms1" },
  {
    kind: "daily-log-upsert",
    entry: {
      id: "dl1",
      at: "2026-06-22T07:30:00.000Z",
      weightKg: 80.5,
      sleepHours: 7.5,
      energyLevel: 7,
      mood: 4,
      note: "ок",
    },
  },
  { kind: "daily-log-delete", entryId: "dl1" },
  { kind: "monthly-plan-set", monthlyPlan: { dataJson: '{"days":[]}' } },
  {
    kind: "workout-template-upsert",
    template: {
      id: "tpl1",
      name: "Push A",
      exerciseIds: ["ex-bench"],
      groups: [],
      updatedAt: "2026-06-22T12:00:00.000Z",
      lastUsedAt: null,
    },
  },
  { kind: "workout-template-delete", templateId: "tpl1" },
  { kind: "programs-set", programs: { activeProgramId: "prog1" } },
  { kind: "plan-template-set", planTemplate: { dataJson: "null" } },
  {
    kind: "wellbeing-upsert",
    entry: {
      dateKey: "2026-06-22",
      mood: 4,
      energy: 7,
      sleepQuality: 3,
      sleepHours: 7.5,
      notes: "норм",
      updatedAt: "2026-06-22T21:00:00.000Z",
    },
  },
  { kind: "wellbeing-delete", dateKey: "2026-06-22" },
  {
    kind: "active-workout-set",
    activeWorkout: { activeWorkoutId: "w1" },
  },
] as never;

describe("mobile fizruk dual-write SQL snapshot (ADR-0073 Крок 0)", () => {
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
