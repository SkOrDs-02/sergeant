// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError } from "@sergeant/api-client";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../modules/finyk/lib/sqliteReader";
import type { ChatAction } from "./types";

/**
 * data-23: `create_transaction` не має ховати відмову сервера (4xx) за
 * «сервер недоступний» і писати локально повз серверні межі. Локальний фолбек
 * лишається лише для мережі, таймаутів, 5xx і 401.
 */

const createManualExpense = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/api", () => ({
  apiClient: { finyk: { createManualExpense } },
}));
vi.mock("./finykActions/dualWriteBridge", () => ({
  finykChatWrite: vi.fn(),
  finykChatMirrorManualExpenses: vi.fn(),
}));
vi.mock("../../../modules/finyk/lib/sqliteWriter", () => ({
  triggerHiddenTransactionSqliteMirror: vi.fn(),
  triggerManualExpenseDeleteSqliteMirror: vi.fn(),
}));

import { handleAsyncChatAction } from "./serverActions";
import { finykChatWrite } from "./finykActions/dualWriteBridge";

const mockWrite = vi.mocked(finykChatWrite);

function httpError(status: number, error?: string): ApiError {
  return new ApiError({
    kind: "http",
    status,
    message: `HTTP ${status}`,
    url: "/api/finyk/manual-expenses",
    body: error ? { error, code: "VALIDATION" } : undefined,
  });
}

function networkError(): ApiError {
  return new ApiError({
    kind: "network",
    message: "Failed to fetch",
    url: "/api/finyk/manual-expenses",
  });
}

async function run(input: Record<string, unknown>): Promise<string> {
  const out = await handleAsyncChatAction({
    name: "create_transaction",
    input,
  } as unknown as ChatAction);
  if (out == null) throw new Error("handler returned undefined");
  return typeof out === "string" ? out : out.result;
}

beforeEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  __setFinykSqliteStateCacheForTests({} as never);
  createManualExpense.mockReset();
  mockWrite.mockClear();
});
afterEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
});

describe("create_transaction · відмова сервера 4xx", () => {
  it("400 VALIDATION → текст відмови, без локального запису і без «сервер недоступний»", async () => {
    createManualExpense.mockRejectedValueOnce(
      httpError(400, "amount: Too big: expected number to be <=1000000000"),
    );
    const out = await run({ amount: 500, category: "food" });
    expect(out).toContain("Сервер відхилив витрату");
    expect(out).toContain("amount: Too big");
    expect(out).toContain("Нічого не записано");
    expect(out).not.toContain("сервер недоступний");
    expect(mockWrite).not.toHaveBeenCalled();
    expect(createManualExpense).toHaveBeenCalledTimes(1);
  });

  it("422 без тіла → відмова з HTTP-статусом, без локального запису", async () => {
    createManualExpense.mockRejectedValueOnce(httpError(422));
    const out = await run({ amount: 500 });
    expect(out).toContain("HTTP 422");
    expect(out).toContain("виправ дані");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("429 → відмова без поради правити дані, без локального запису", async () => {
    createManualExpense.mockRejectedValueOnce(httpError(429));
    const out = await run({ amount: 500 });
    expect(out).toContain("Сервер відхилив витрату");
    expect(out).toContain("забагато запитів");
    expect(out).not.toContain("виправ дані");
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe("create_transaction · локальний фолбек лишається", () => {
  it.each([
    ["мережева помилка", networkError()],
    ["5xx", httpError(503)],
    ["401", httpError(401)],
    ["не-ApiError", new TypeError("boom")],
  ])("%s → запис локально з поясненням", async (_name, err) => {
    createManualExpense.mockRejectedValueOnce(err);
    const out = await run({ amount: 120, description: "кава" });
    expect(out).toContain("сервер недоступний, записано лише локально");
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});

describe("create_transaction · межі до запиту", () => {
  it("expense 20 000 000 → відмова, сервер не кличемо, нічого не пишемо", async () => {
    const out = await run({ amount: 20_000_000, category: "food" });
    expect(out).toContain("завелика");
    expect(createManualExpense).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("income 20 000 000 → відмова, нічого не пишемо", async () => {
    const out = await run({ type: "income", amount: 20_000_000 });
    expect(out).toContain("завелика");
    expect(createManualExpense).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("опис 600 символів → відмова", async () => {
    const out = await run({ amount: 10, description: "x".repeat(600) });
    expect(out).toContain("Опис задовгий");
    expect(createManualExpense).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("дата 2150-01-01 → відмова", async () => {
    const out = await run({ amount: 10, date: "2150-01-01" });
    expect(out).toContain("Дата поза допустимим діапазоном");
    expect(createManualExpense).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("income у межах → локальний запис", async () => {
    const out = await run({ type: "income", amount: 20_000 });
    expect(out).toContain("Дохід");
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});
