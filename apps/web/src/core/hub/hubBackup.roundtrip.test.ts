/**
 * Last validated: 2026-09-22
 * Status: Active
 *
 * Замкнене коло бекапу Фініка: внести дані → експорт → очистити
 * пристрій → імпорт → усе на місці, суми збігаються.
 *
 * Чому окремим файлом, а не в `hubBackup.apply.test.ts`: той сьют
 * мокає ВСІ чотири модульні адаптери, тож перевіряє лише маршрутизацію
 * («яку функцію покликали»), і саме тому пропустив дефект, заради
 * якого цей файл існує — імпорт Фініка писав у localStorage, тоді як
 * кожне читання Фініка бере дані з теплого SQLite-кеша
 * (`getCachedFinykSqliteState`). Функцію кликали, дані зникали.
 *
 * Тут реальні: `finykBackup.ts`, увесь `sqliteWriter/*`, `sqliteReader`
 * і справжній in-memory SQLite (better-sqlite3) з накатаними
 * міграціями Фініка. Замокані лише три інші модулі (мають власні
 * сьюти) і `enqueueOutboxUpsert` — таблиці `sync_op_outbox` у тестовій
 * БД немає, як і в `sqliteWriter/__tests__/integration.test.ts`.
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));

const buildFizrukFullBackupPayload = vi.fn(() => ({ fizruk: true }));
const applyFizrukFullBackupPayload = vi.fn();
vi.mock("../../modules/fizruk/lib/fizrukStorage", () => ({
  buildFizrukFullBackupPayload: () => buildFizrukFullBackupPayload(),
  applyFizrukFullBackupPayload: (v: unknown) => applyFizrukFullBackupPayload(v),
}));

const buildRoutineBackupPayload = vi.fn(() => ({ routine: true }));
const applyRoutineBackupPayload = vi.fn();
vi.mock("../../modules/routine/lib/routineStorage", () => ({
  buildRoutineBackupPayload: () => buildRoutineBackupPayload(),
  applyRoutineBackupPayload: (v: unknown) => applyRoutineBackupPayload(v),
}));

const buildNutritionBackupPayload = vi.fn(() => ({ nutrition: true }));
const applyNutritionBackupPayload = vi.fn();
vi.mock("../../modules/nutrition/domain/nutritionBackup", () => ({
  buildNutritionBackupPayload: () => buildNutritionBackupPayload(),
  applyNutritionBackupPayload: (v: unknown) => applyNutritionBackupPayload(v),
}));

import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../../modules/finyk/lib/sqliteWriter/__tests__/testSqlite.js";
import {
  __clearFinykDualWriteContextForTests,
  dualWriteFinykState,
  registerFinykDualWriteContext,
} from "../../modules/finyk/lib/sqliteWriter/index.js";
import {
  EMPTY_FINYK_STATE,
  type FinykDualWriteState,
} from "../../modules/finyk/lib/sqliteWriter/diff.js";
import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "../../modules/finyk/lib/sqliteReader.js";
import { applyHubBackupPayload, buildHubBackupPayload } from "./hubBackup";

const USER_ID = "u-roundtrip";

const EXPENSES = [
  { id: "me-1", date: "2026-09-01", description: "Кава", amount: 85.5 },
  { id: "me-2", date: "2026-09-02", description: "Метро", amount: 8 },
  {
    id: "me-3",
    date: "2026-09-03",
    description: "Зарплата",
    amount: 42000,
    kind: "income" as const,
  },
];
const EXPENSES_TOTAL = 85.5 + 8 + 42000;

const SUBSCRIPTION = {
  id: "sub-1",
  name: "Netflix",
  keyword: "netflix",
  billingDay: 14,
  currency: "UAH",
  amount: 279,
};

let handle: TestSqliteHandle;
let clock = Date.parse("2026-09-22T10:00:00.000Z");

beforeEach(async () => {
  localStorage.clear();
  clearFinykSqliteCache();
  __clearFinykDualWriteContextForTests();
  handle = await createTestSqlite();
  registerFinykDualWriteContext({
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    // Монотонний годинник: LWW-гард адаптера строго `>`, а імпорт
    // перезаписує ті самі рядки, що й сід.
    getNow: () => new Date((clock += 1000)).toISOString(),
  });
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  vi.clearAllMocks();
});

/** Імітує сесію користувача: вносить дані через справжній writer. */
async function seedFinyk(): Promise<void> {
  const next: FinykDualWriteState = {
    ...EMPTY_FINYK_STATE,
    manualExpenses: EXPENSES.map((e) => ({
      id: e.id,
      dataJson: JSON.stringify(e),
    })),
    subscriptions: [
      { id: SUBSCRIPTION.id, dataJson: JSON.stringify(SUBSCRIPTION) },
    ],
    prefs: {
      monthlyPlanJson: JSON.stringify({ income: "42000", expense: "20000" }),
      showBalance: false,
      excludedStatTxIdsJson: "[]",
      dismissedRecurringJson: "[]",
      prefsJson: "{}",
    },
  };
  const outcome = await dualWriteFinykState(EMPTY_FINYK_STATE, next);
  expect(outcome.status).toBe("applied");
}

/** Новий пристрій: жодного рядка Фініка й холодний кеш. */
async function wipeDevice(): Promise<void> {
  for (const table of [
    "finyk_manual_expenses",
    "finyk_subscriptions",
    "finyk_prefs",
  ]) {
    await handle.client.run(`DELETE FROM ${table}`, []);
  }
  localStorage.clear();
  clearFinykSqliteCache();
  await refreshFinykSqliteState(handle.client, USER_ID);
}

function cachedExpenseTotal(): number {
  return getCachedFinykSqliteState().manualExpenses.reduce(
    (sum, e) => sum + Number(e.amount),
    0,
  );
}

describe("Hub backup — коло експорт → очистка → імпорт (Фінік, справжній SQLite)", () => {
  it("повертає ручні операції, підписку й план після імпорту на очищений пристрій", async () => {
    await seedFinyk();
    await refreshFinykSqliteState(handle.client, USER_ID);
    expect(cachedExpenseTotal()).toBe(EXPENSES_TOTAL);

    const payload = buildHubBackupPayload();
    // Експорт бере дані з теплого кеша, а не з мертвих LS-ключів.
    const exported = payload.finyk as Record<string, unknown>;
    expect(exported["manualExpenses"]).toEqual(EXPENSES);
    expect(exported["subscriptions"]).toEqual([SUBSCRIPTION]);

    await wipeDevice();
    expect(getCachedFinykSqliteState().manualExpenses).toEqual([]);
    expect(getCachedFinykSqliteState().subscriptions).toEqual([]);

    await applyHubBackupPayload(JSON.parse(JSON.stringify(payload)));
    await refreshFinykSqliteState(handle.client, USER_ID);

    const cache = getCachedFinykSqliteState();
    expect(cache.manualExpenses).toEqual(EXPENSES);
    expect(cachedExpenseTotal()).toBe(EXPENSES_TOTAL);
    expect(cache.subscriptions).toEqual([SUBSCRIPTION]);
    expect(cache.monthlyPlan).toEqual({ income: "42000", expense: "20000" });
  });

  it("пише саме в SQLite-таблиці, а не лише в localStorage", async () => {
    await seedFinyk();
    await refreshFinykSqliteState(handle.client, USER_ID);
    const payload = buildHubBackupPayload();
    await wipeDevice();

    await applyHubBackupPayload(JSON.parse(JSON.stringify(payload)));

    const rows = await handle.client.all<{ id: string; data_json: string }>(
      `SELECT id, data_json FROM finyk_manual_expenses
        WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC`,
      [USER_ID],
    );
    expect(rows.map((r) => r.id)).toEqual(["me-1", "me-2", "me-3"]);
    expect(
      rows.reduce(
        (sum, r) => sum + Number((JSON.parse(r.data_json) as never)["amount"]),
        0,
      ),
    ).toBe(EXPENSES_TOTAL);
  });

  it("замінює дані пристрою, а не зливає їх із бекапом", async () => {
    await seedFinyk();
    await refreshFinykSqliteState(handle.client, USER_ID);
    const payload = buildHubBackupPayload();

    // Після експорту користувач додав ще одну витрату — діалог імпорту
    // обіцяє «повністю замінить ці дані», тож її має не стати.
    const withExtra: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      manualExpenses: [
        ...EXPENSES.map((e) => ({ id: e.id, dataJson: JSON.stringify(e) })),
        {
          id: "me-later",
          dataJson: JSON.stringify({
            id: "me-later",
            date: "2026-09-20",
            description: "Пізніша витрата",
            amount: 1000,
          }),
        },
      ],
    };
    await dualWriteFinykState(EMPTY_FINYK_STATE, withExtra);
    await refreshFinykSqliteState(handle.client, USER_ID);
    expect(getCachedFinykSqliteState().manualExpenses).toHaveLength(4);

    await applyHubBackupPayload(JSON.parse(JSON.stringify(payload)));
    await refreshFinykSqliteState(handle.client, USER_ID);

    const cache = getCachedFinykSqliteState();
    expect(cache.manualExpenses.map((e) => e.id)).toEqual([
      "me-1",
      "me-2",
      "me-3",
    ]);
    expect(cachedExpenseTotal()).toBe(EXPENSES_TOTAL);
  });

  it("не чіпає зрізи, яких немає у файлі, і не гасить showBalance", async () => {
    await seedFinyk();
    await refreshFinykSqliteState(handle.client, USER_ID);
    expect(getCachedFinykSqliteState().showBalance).toBe(false);

    await applyHubBackupPayload({
      kind: "hub-backup",
      schemaVersion: 1,
      exportedAt: "2026-09-22T10:00:00.000Z",
      finyk: { version: 3, budgets: [{ id: "b-1", limit: 500 }] },
      fizruk: null,
      routine: null,
      nutrition: null,
    });
    await refreshFinykSqliteState(handle.client, USER_ID);

    const cache = getCachedFinykSqliteState();
    expect(cache.budgets).toEqual([{ id: "b-1", limit: 500 }]);
    // Бекап не віз ані витрат, ані showBalance — обидва лишились як були.
    expect(cache.manualExpenses).toHaveLength(EXPENSES.length);
    expect(cache.showBalance).toBe(false);
  });
});
