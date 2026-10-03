// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Дзеркало в SQLite — асинхронний побічний ефект, якому потрібна жива база.
// Тут перевіряємо саме те, що міст передає в нього: `prev → next` від
// КАНОНІЧНОГО кешу (data-08), а не від порожнього kv.
const mirror = vi.hoisted(() => ({
  mirrorFinykChatDualWrite: vi.fn(async () => {}),
  mirrorFinykChatMonthlyPlan: vi.fn(async () => {}),
}));
vi.mock("../../../../modules/finyk/lib/sqliteWriter/chatBridge", () => mirror);

import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
} from "../../../../modules/finyk/lib/sqliteReader";
import { diffFinykDualWriteOps } from "../../../../modules/finyk/lib/sqliteWriter/diff";
import { finykChatWrite } from "./dualWriteBridge";
import { markDebtPaid } from "./debts";
import { setBudgetLimit, setMonthlyPlan } from "./budgets";

const uiDebt = {
  id: "d_ui",
  name: "Борг з UI",
  totalAmount: 1000,
  dueDate: "",
  emoji: "",
  linkedTxIds: [] as string[],
};

/** Сід кешу SQLite без повної типізації рядків — тестам досить мінімуму полів. */
function seedFinykCache(partial: Record<string, unknown>): void {
  __setFinykSqliteStateCacheForTests(partial as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearFinykSqliteCache();
});
afterEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
});

function lastSliceDiff() {
  const call = mirror.mirrorFinykChatDualWrite.mock.calls.at(-1) as unknown as
    Parameters<typeof diffFinykDualWriteOps> | undefined;
  if (!call) throw new Error("mirrorFinykChatDualWrite не викликано");
  return diffFinykDualWriteOps(call[0], call[1]);
}

describe("finykChatWrite: prev береться з кешу SQLite", () => {
  it("видалення елемента емітить delete, хоча kv порожній", () => {
    seedFinykCache({ manualDebts: [uiDebt] });
    // kv порожній: UI його не пише. Раніше prev=[] → delete не емітився.
    finykChatWrite("finyk_debts", []);
    expect(lastSliceDiff()).toEqual([
      expect.objectContaining({ kind: "blob-delete", id: "d_ui" }),
    ]);
  });

  it("додавання не чіпає решту рядків із кешу (лише один upsert)", () => {
    seedFinykCache({ manualDebts: [uiDebt] });
    finykChatWrite("finyk_debts", [uiDebt, { ...uiDebt, id: "d_new" }]);
    expect(lastSliceDiff()).toEqual([
      expect.objectContaining({
        kind: "blob-upsert",
        entry: expect.objectContaining({ id: "d_new" }),
      }),
    ]);
  });

  it("оптимістично патчить кеш: наступний екзекутор бачить попередній запис", () => {
    seedFinykCache({});
    setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 1000 },
    });
    setBudgetLimit({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 2000 },
    });
    const budgets = getCachedFinykSqliteState().budgets;
    // Другий виклик оновив той самий ліміт, а не додав дубль.
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({ categoryId: "food", limit: 2000 });
  });

  it("два set_monthly_plan поспіль: другий не стирає поле першого", () => {
    seedFinykCache({
      monthlyPlan: { income: "50000", expense: "25000", savings: "10000" },
    });
    setMonthlyPlan({ name: "set_monthly_plan", input: { income: 60000 } });
    setMonthlyPlan({ name: "set_monthly_plan", input: { expense: 30000 } });
    expect(getCachedFinykSqliteState().monthlyPlan).toEqual({
      income: "60000",
      expense: "30000",
      savings: "10000",
    });
  });

  it("холодний кеш не патчиться (нічого оптимістично вигадувати)", () => {
    finykChatWrite("finyk_debts", [uiDebt]);
    expect(getCachedFinykSqliteState().refreshedAt).toBeNull();
    expect(getCachedFinykSqliteState().manualDebts).toEqual([]);
  });
});

describe("finykChatWrite: місячний план", () => {
  it("передає повний наступний план і знімок prev ДО патча кешу", () => {
    seedFinykCache({
      monthlyPlan: { income: "50000", expense: "25000", savings: "10000" },
    });
    setMonthlyPlan({ name: "set_monthly_plan", input: { expense: 30000 } });

    expect(mirror.mirrorFinykChatMonthlyPlan).toHaveBeenCalledTimes(1);
    const [nextJson, prevJson] = mirror.mirrorFinykChatMonthlyPlan.mock
      .calls[0] as unknown as [string, string];
    // Частковий виклик НЕ стер решту полів: у next є і income, і savings.
    expect(JSON.parse(nextJson)).toEqual({
      income: "50000",
      expense: "30000",
      savings: "10000",
    });
    expect(JSON.parse(prevJson)).toEqual({
      income: "50000",
      expense: "25000",
      savings: "10000",
    });
  });

  it("undo повертає повний попередній план, а не порожній", () => {
    seedFinykCache({
      monthlyPlan: { income: "50000", expense: "25000", savings: "10000" },
    });
    const out = setMonthlyPlan({
      name: "set_monthly_plan",
      input: { income: 60000 },
    });
    if (typeof out === "string" || !("undo" in out)) throw new Error("no undo");
    out.undo?.();
    const [undoJson] = mirror.mirrorFinykChatMonthlyPlan.mock
      .calls[1] as unknown as [string, string];
    expect(JSON.parse(undoJson)).toEqual({
      income: "50000",
      expense: "25000",
      savings: "10000",
    });
  });
});

describe("mark_debt_paid поверх боргу з UI (наскрізно через міст)", () => {
  it("закритий борг видаляється, виплата додається, kv не потрібен", () => {
    seedFinykCache({ manualDebts: [uiDebt] });
    const out = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_ui", amount: 1000 },
    }) as string;
    expect(out).toContain("борг закрито");

    const calls = mirror.mirrorFinykChatDualWrite.mock
      .calls as unknown as Array<Parameters<typeof diffFinykDualWriteOps>>;
    const allOps = calls.flatMap(([prev, next]) =>
      diffFinykDualWriteOps(prev, next),
    );
    expect(allOps).toContainEqual(
      expect.objectContaining({ kind: "blob-delete", id: "d_ui" }),
    );
    expect(allOps).toContainEqual(
      expect.objectContaining({
        kind: "blob-upsert",
        table: "finyk_manual_expenses",
      }),
    );
  });
});
