// @vitest-environment jsdom
//
// Холодний старт Фініка (аудит 2026-10-01, data-13). Справжній хук, діф,
// писар і SQLite (better-sqlite3): витрата, додана ДО прогріву читального
// кешу, мусить дійти в SQLite і в outbox, а правила мерчантів, яких слоти
// ще не бачили, не мусять бути перетерті дефолтами.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";

import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import { installMemoryLocalStorage } from "../../../core/durability/__tests__/memoryLocalStorage.js";
import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "../lib/sqliteReader.js";
import {
  __closeFinykSqliteMutationWindow,
  __openFinykSqliteMutationWindow,
  __resetFinykSqliteReadGateForTests,
  notifyFinykSqliteCacheRefresh,
} from "../lib/sqliteReadGate.js";
import {
  __clearFinykDualWriteContextForTests,
  applyFinykDualWriteOps,
  registerFinykDualWriteContext,
} from "../lib/sqliteWriter/index.js";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../lib/sqliteWriter/__tests__/testSqlite.js";
import { useFinykDualWriteSync } from "./useFinykDualWriteSync";
import {
  useFinykStorageSlots,
  type FinykStorageSlots,
} from "./useFinykStorageSlots";

const USER_ID = "u-cold";
const T0 = "2026-10-01T10:00:00.000Z";

const RULE: MerchantRule = {
  id: "mr_1",
  kind: "expense",
  merchantKey: "сільпо",
  categoryId: "restaurant",
  label: "Сільпо",
  createdAt: T0,
  updatedAt: T0,
};

function coldSlots(
  overrides: Partial<Record<string, unknown>> = {},
): FinykStorageSlots {
  return {
    storageReady: false,
    showBalance: true,
    hiddenAccounts: [],
    hiddenTxIds: [],
    budgets: [],
    subscriptions: [],
    manualAssets: [],
    manualDebts: [],
    receivables: [],
    customCategories: [],
    manualExpenses: [],
    txCategories: {},
    txSplits: {},
    monoDebtLinkedTxIds: {},
    networthHistory: [],
    monthlyPlan: { income: "", expense: "", savings: "" },
    excludedStatTxIds: [],
    dismissedRecurring: [],
    // До прогріву правил у слоті немає: це дефолт, а не стан користувача.
    merchantRules: [],
    ...overrides,
  } as unknown as FinykStorageSlots;
}

let handle: TestSqliteHandle;

beforeEach(async () => {
  installMemoryLocalStorage();
  handle = await createTestSqlite();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  vi.mocked(enqueueOutboxUpsert).mockClear();

  // На диску вже є дані акаунта: правило мерчанта й давня витрата.
  await applyFinykDualWriteOps(
    handle.client,
    [
      {
        kind: "prefs-upsert",
        prefs: {
          monthlyPlanJson: "{}",
          showBalance: true,
          excludedStatTxIdsJson: "[]",
          dismissedRecurringJson: "[]",
          prefsJson: JSON.stringify({ merchantRules: [RULE] }),
        },
      },
      {
        kind: "blob-upsert",
        table: "finyk_manual_expenses",
        entry: { id: "old-1", dataJson: '{"id":"old-1","amount":5}' },
      },
    ],
    { userId: USER_ID, clientTs: T0 },
  );
  vi.mocked(enqueueOutboxUpsert).mockClear();
  // Кеш лишається холодним: це і є «холодний старт».
  clearFinykSqliteCache();
  registerFinykDualWriteContext({
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    getNow: () => new Date().toISOString(),
  });
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
});

const expenseIds = async (): Promise<string[]> => {
  const rows = await handle.client.all<{ id: string }>(
    "SELECT id FROM finyk_manual_expenses WHERE deleted_at IS NULL ORDER BY id",
  );
  return rows.map((r) => r.id);
};

describe("useFinykDualWriteSync: запис до прогріву кешу", () => {
  it("витрата, додана на холодному старті, доходить у SQLite й outbox, а правила мерчантів лишаються", async () => {
    expect(getCachedFinykSqliteState().refreshedAt).toBeNull();

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: coldSlots() },
    });
    // Миттєве додавання, поки `storageReady === false`; заодно тумблер
    // `showBalance` — prefs-зміна, яку до прогріву писати не можна.
    rerender({
      s: coldSlots({
        showBalance: false,
        manualExpenses: [{ id: "new-1", amount: 12, category: "food" }],
      }),
    });

    await vi.waitFor(async () => expect(await expenseIds()).toContain("new-1"));
    expect(await expenseIds()).toEqual(["new-1", "old-1"]);

    const outboxTables = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.map((c) => c[1]?.table);
    expect(outboxTables).toContain("finyk_manual_expenses");
    // prefs до прогріву не чіпаємо: ні `prefs-upsert`, ні перезапису правил.
    expect(outboxTables).not.toContain("finyk_prefs");

    const after = await refreshFinykSqliteState(handle.client, USER_ID);
    expect(after.merchantRules).toEqual([RULE]);
    expect(after.showBalance).toBe(true);
    expect(after.manualExpenses.map((e) => e["id"])).toEqual(
      expect.arrayContaining(["new-1", "old-1"]),
    );
  });

  // Знахідка рев'ю: `refreshedAt` ставиться всередині запису ще до закриття
  // mutation-вікна, а overlay слотів іде лише з наступним тіком гейта. У цьому
  // проміжку кеш уже теплий, а слоти ще дефолтні (`merchantRules: []`). Тумблер
  // у ньому не мусить стерти правила мерчантів. Справжні слоти й гейт, без
  // ручного збирання слотів.
  it("pref-тумблер у проміжку «кеш теплий, overlay ще не було» не стирає правила мерчантів", async () => {
    const { result } = renderHook(() => {
      const slots = useFinykStorageSlots();
      useFinykDualWriteSync(slots);
      return slots;
    });
    expect(result.current.storageReady).toBe(false);

    // Реплей/запис на старті тримає вікно відкритим, а кеш уже прогрітий.
    __openFinykSqliteMutationWindow();
    await refreshFinykSqliteState(handle.client, USER_ID);
    notifyFinykSqliteCacheRefresh(); // подавлено: тіка немає
    expect(getCachedFinykSqliteState().refreshedAt).not.toBeNull();

    act(() => {
      result.current.setShowBalance(false);
    });
    // Overlay ще не було, тож слоти не готові, хоч кеш теплий.
    expect(result.current.storageReady).toBe(false);

    // Дати черзі dual-write шанс (якщо баг є, prefs-upsert піде сюди).
    await new Promise((r) => setTimeout(r, 50));
    const outboxTables = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.map((c) => c[1]?.table);
    expect(outboxTables).not.toContain("finyk_prefs");
    const onDisk = await refreshFinykSqliteState(handle.client, USER_ID);
    expect(onDisk.merchantRules).toEqual([RULE]);
    expect(onDisk.showBalance).toBe(true);

    // Вікно закрилось, тік пішов: overlay застосовано, слоти готові й несуть
    // стан користувача, а не дефолти.
    __closeFinykSqliteMutationWindow();
    act(() => {
      notifyFinykSqliteCacheRefresh();
    });
    expect(result.current.storageReady).toBe(true);
    expect(result.current.merchantRules).toEqual([RULE]);
    expect(result.current.showBalance).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(
      vi.mocked(enqueueOutboxUpsert).mock.calls.map((c) => c[1]?.table),
    ).not.toContain("finyk_prefs");
  });
});
