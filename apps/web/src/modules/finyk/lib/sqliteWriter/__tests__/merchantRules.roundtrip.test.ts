// Правила «Завжди так для цього магазину» (рішення власника 2026-10-01) їдуть
// у `finyk_prefs.prefs_json` — тим самим шляхом, що решта налаштувань.
// Тест тримає весь ланцюг на справжньому SQLite: слот → діф → писар →
// outbox-рядок → читач → pull іншого пристрою → читач.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import {
  __resetApplyPullOpCachesForTests,
  applyPullOp,
} from "../../../../../core/syncEngine/applyPullOp.js";
import type { FinykStorageSlots } from "../../../hooks/useFinykStorageSlots";
import { persistFinykNormalizedToSqlite } from "../../finykBackup";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "../../sqliteReader.js";
import { __resetFinykSqliteReadGateForTests } from "../../sqliteReadGate.js";
import { mirrorFinykChatMonthlyPlan } from "../chatBridge.js";
import { diffFinykDualWriteOps, EMPTY_FINYK_STATE } from "../diff.js";
import { extractFinykDualWriteState } from "../extract.js";
import {
  __clearFinykDualWriteContextForTests,
  applyFinykDualWriteOps,
  registerFinykDualWriteContext,
} from "../index.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const USER_ID = "u-1";
const OTHER_DEVICE = "device-a";
const MINE = "device-b";
const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-01T11:00:00.000Z";
const T3 = "2026-10-01T12:00:00.000Z";

const RULE: MerchantRule = {
  id: "mr_1",
  kind: "expense",
  merchantKey: "сільпо",
  categoryId: "restaurant",
  label: "Сільпо",
  createdAt: T1,
  updatedAt: T1,
};

function slotsWith(merchantRules: MerchantRule[]): FinykStorageSlots {
  return {
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
    monthlyPlan: {},
    excludedStatTxIds: [],
    dismissedRecurring: [],
    merchantRules,
  } as unknown as FinykStorageSlots;
}

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  __resetApplyPullOpCachesForTests();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  vi.mocked(enqueueOutboxUpsert).mockClear();
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
});

async function readRules(): Promise<MerchantRule[] | null> {
  return (await refreshFinykSqliteState(handle.client, USER_ID)).merchantRules;
}

describe("слот → діф", () => {
  it("правила потрапляють у prefsJson, а зміна лише правил дає рівно один prefs-upsert", () => {
    const empty = extractFinykDualWriteState(slotsWith([]), true);
    const withRule = extractFinykDualWriteState(slotsWith([RULE]), true);
    expect(JSON.parse(withRule.prefs!.prefsJson)).toEqual({
      merchantRules: [RULE],
    });

    const ops = diffFinykDualWriteOps(
      { ...EMPTY_FINYK_STATE, prefs: empty.prefs },
      { ...EMPTY_FINYK_STATE, prefs: withRule.prefs },
    );
    expect(ops.map((op) => op.kind)).toEqual(["prefs-upsert"]);
  });

  it("незмінні правила не дають жодного оп-а", () => {
    const a = extractFinykDualWriteState(slotsWith([RULE]), true);
    const b = extractFinykDualWriteState(slotsWith([{ ...RULE }]), true);
    expect(
      diffFinykDualWriteOps(
        { ...EMPTY_FINYK_STATE, prefs: a.prefs },
        { ...EMPTY_FINYK_STATE, prefs: b.prefs },
      ),
    ).toEqual([]);
  });

  it("сміття у слоті не потрапляє в prefs_json", () => {
    const state = extractFinykDualWriteState(
      slotsWith([RULE, { id: "x" } as unknown as MerchantRule]),
      true,
    );
    expect(JSON.parse(state.prefs!.prefsJson).merchantRules).toEqual([RULE]);
  });
});

describe("писар → SQLite → читач", () => {
  it("правила переживають запис і читаються назад; outbox-рядок несе prefs_json", async () => {
    const prefsJson = JSON.stringify({ merchantRules: [RULE] });
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
            prefsJson,
          },
        },
      ],
      { userId: USER_ID, clientTs: T1 },
    );

    expect(await readRules()).toEqual([RULE]);

    const call = vi.mocked(enqueueOutboxUpsert).mock.calls.at(-1)?.[1];
    expect(call?.table).toBe("finyk_prefs");
    // Серверний applyFinykPrefs читає саме `row.prefs_json` і інакше
    // перезаписав би PG-копію значенням `{}`.
    expect(call?.row["prefs_json"]).toBe(prefsJson);
  });

  it("зіпсований prefs_json у БД дає порожній список, а не виняток", async () => {
    await handle.client.run(
      `INSERT INTO finyk_prefs (user_id, prefs_json, monthly_plan_json,
         show_balance, excluded_stat_tx_ids_json, dismissed_recurring_json,
         created_at, updated_at)
       VALUES (?, 'не json', '{}', 1, '[]', '[]', ?, ?)`,
      [USER_ID, T1, T1],
    );
    expect(await readRules()).toEqual([]);
  });

  it("порожня БД без рядка prefs: null (слот не затирається порожнім списком)", async () => {
    expect(await readRules()).toBeNull();
  });
});

describe("sync: pull з іншого пристрою", () => {
  function prefsOp(
    clientTs: string,
    row: Record<string, unknown>,
    id = 1,
  ): Parameters<typeof applyPullOp>[1] {
    return {
      id,
      table: "finyk_prefs",
      op: "insert",
      row: { user_id: USER_ID, ...row },
      client_ts: clientTs,
      server_ts: clientTs,
      origin_device_id: OTHER_DEVICE,
    };
  }

  it("правило, створене на іншому пристрої, зʼявляється тут після pull", async () => {
    const outcome = await applyPullOp(
      handle.client,
      prefsOp(T1, {
        monthly_plan_json: "{}",
        show_balance: 1,
        excluded_stat_tx_ids_json: "[]",
        dismissed_recurring_json: "[]",
        prefs_json: JSON.stringify({ merchantRules: [RULE] }),
      }),
      USER_ID,
      MINE,
    );
    expect(outcome).toBe("applied");
    expect(await readRules()).toEqual([RULE]);
  });

  it("видалення правила на іншому пристрої доходить сюди (новіший prefs_json без нього)", async () => {
    await applyPullOp(
      handle.client,
      prefsOp(T1, {
        prefs_json: JSON.stringify({ merchantRules: [RULE] }),
      }),
      USER_ID,
      MINE,
    );
    await applyPullOp(
      handle.client,
      prefsOp(T2, { prefs_json: JSON.stringify({ merchantRules: [] }) }, 2),
      USER_ID,
      MINE,
    );
    expect(await readRules()).toEqual([]);
  });

  it("оп старішого клієнта БЕЗ prefs_json (інша зміна prefs) правил не стирає", async () => {
    await applyPullOp(
      handle.client,
      prefsOp(T1, {
        prefs_json: JSON.stringify({ merchantRules: [RULE] }),
      }),
      USER_ID,
      MINE,
    );
    // Пристрій на старій збірці змінив лише місячний план: ключа prefs_json у
    // рядку нема, generic-застосування чіпає лише надіслані колонки.
    await applyPullOp(
      handle.client,
      prefsOp(T2, { monthly_plan_json: '{"income":"1"}' }, 2),
      USER_ID,
      MINE,
    );
    expect(await readRules()).toEqual([RULE]);
    expect(
      (await refreshFinykSqliteState(handle.client, USER_ID)).monthlyPlan,
    ).toEqual({ income: "1" });
  });

  it("власний запис пристрою (origin збігається) pull пропускає — ехо не дублюється", async () => {
    const outcome = await applyPullOp(
      handle.client,
      { ...prefsOp(T1, { prefs_json: "{}" }), origin_device_id: MINE },
      USER_ID,
      MINE,
    );
    expect(outcome).toBe("skipped");
  });
});

describe("інші записи prefs не гублять правила", () => {
  function register(): void {
    registerFinykDualWriteContext({
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => T3,
    });
  }

  it("зміна місячного плану через чат несе правила з кешу", async () => {
    register();
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
      ],
      { userId: USER_ID, clientTs: T1 },
    );
    await refreshFinykSqliteState(handle.client, USER_ID);
    expect(getCachedFinykSqliteState().merchantRules).toEqual([RULE]);

    await mirrorFinykChatMonthlyPlan('{"income":"5000"}');

    expect(await readRules()).toEqual([RULE]);
    expect(getCachedFinykSqliteState().monthlyPlan).toEqual({ income: "5000" });
  });

  it("імпорт бекапу без правил лишає наявні; з правилами — замінює", async () => {
    register();
    __setFinykSqliteStateCacheForTests({ merchantRules: [RULE] });
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
      ],
      { userId: USER_ID, clientTs: T1 },
    );

    await persistFinykNormalizedToSqlite({ budgets: [] }, "replace");
    expect(await readRules()).toEqual([RULE]);

    const replacement: MerchantRule = {
      ...RULE,
      id: "mr_2",
      merchantKey: "атб",
    };
    __setFinykSqliteStateCacheForTests({ merchantRules: [RULE] });
    await persistFinykNormalizedToSqlite(
      { merchantRules: [replacement] },
      "replace",
    );
    expect(await readRules()).toEqual([replacement]);
  });
});
