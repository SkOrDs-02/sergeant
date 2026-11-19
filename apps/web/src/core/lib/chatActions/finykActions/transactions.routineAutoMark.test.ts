import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../../modules/finyk/lib/sqliteReader";
import { onHubBus, type HubBusEvents } from "@shared/lib/modules/hubBus";

/**
 * Витрата, записана через чат, — це витрата, яку людина записала сама
 * (рішення founder-а 2026-11-18), тож вона дає Рутині ту саму подію, що й
 * форма. Дохід, збій запису і відкат події не дають.
 */

vi.mock("./dualWriteBridge", () => ({ finykChatWrite: vi.fn() }));
vi.mock("../../../../modules/finyk/lib/sqliteWriter", () => ({
  triggerHiddenTransactionSqliteMirror: vi.fn(),
  triggerManualExpenseDeleteSqliteMirror: vi.fn(),
}));

import { finykChatWrite } from "./dualWriteBridge";
import { createTransaction } from "./transactions";
import type { ChatActionUndoableResult } from "../types";

const mockWrite = vi.mocked(finykChatWrite);
type AutoMark = HubBusEvents["routineAutoMark"];
let events: AutoMark[] = [];
let off: () => void = () => {};

/** Дати мікрозадачам `.then` після запису відпрацювати. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mockWrite.mockResolvedValue(true);
  __setFinykSqliteStateCacheForTests({
    manualExpenses: [],
    customCategories: [],
  } as never);
  events = [];
  off = onHubBus("routineAutoMark", (d) => events.push(d));
});

afterEach(() => {
  off();
  clearFinykSqliteCache();
  vi.useRealTimers();
});

describe("createTransaction · автовідмітка Рутини", () => {
  it("витрата з явною датою → подія finyk_expense з тим самим днем", async () => {
    createTransaction({
      name: "create_transaction",
      input: { amount: 120, date: "2026-11-18" },
    });
    await flush();
    expect(events).toEqual([{ source: "finyk_expense", dayKey: "2026-11-18" }]);
  });

  it("витрата без дати → день за годинником пристрою", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 23, 30));
    createTransaction({ name: "create_transaction", input: { amount: 50 } });
    vi.useRealTimers();
    await flush();
    expect(events).toEqual([{ source: "finyk_expense", dayKey: "2026-11-18" }]);
  });

  it("дохід → без події", async () => {
    createTransaction({
      name: "create_transaction",
      input: { type: "income", amount: 5000 },
    });
    await flush();
    expect(events).toEqual([]);
  });

  it("запис не ліг → без події", async () => {
    mockWrite.mockResolvedValue(false);
    createTransaction({ name: "create_transaction", input: { amount: 80 } });
    await flush();
    expect(events).toEqual([]);
  });

  it("запис відхилено → без події і без необробленої відмови", async () => {
    mockWrite.mockRejectedValue(new Error("sqlite down"));
    createTransaction({ name: "create_transaction", input: { amount: 80 } });
    await flush();
    expect(events).toEqual([]);
  });

  it("відкат не дає другої події", async () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: 80, date: "2026-11-18" },
    }) as ChatActionUndoableResult;
    await flush();
    out.undo?.();
    await flush();
    expect(events).toHaveLength(1);
  });
});
