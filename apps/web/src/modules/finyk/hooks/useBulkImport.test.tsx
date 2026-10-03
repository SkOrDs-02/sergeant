// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ImportCommitRequest,
  ImportCommitResponse,
} from "@sergeant/api-client";

const analyzeImportScreenshotMock = vi.fn();
const previewImportStatementMock = vi.fn();
const commitImportMock = vi.fn();
const getImportBatchMock = vi.fn();
const deleteImportBatchMock = vi.fn();

const bootSyncEngineReaderMock = vi.fn();
const pullOnceMock = vi.fn();

vi.mock("../../../core/syncEngine/singleton", () => ({
  bootSyncEngineReader: (...args: unknown[]) =>
    bootSyncEngineReaderMock(...args),
}));

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      finyk: {
        ...actual.apiClient.finyk,
        analyzeImportScreenshot: (...args: unknown[]) =>
          analyzeImportScreenshotMock(...args),
        previewImportStatement: (...args: unknown[]) =>
          previewImportStatementMock(...args),
        commitImport: (...args: unknown[]) => commitImportMock(...args),
        getImportBatch: (...args: unknown[]) => getImportBatchMock(...args),
        deleteImportBatch: (...args: unknown[]) =>
          deleteImportBatchMock(...args),
      },
    },
  };
});

import {
  useImportBatchUndo,
  useImportCommit,
  useImportScreenshotAnalyze,
  useImportStatementPreview,
} from "./useBulkImport";
import type { ManualExpenseWriteThroughStorage } from "./manualExpenseWriteThrough";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeStorage(
  manualExpenses: ReadonlyArray<{ id: string }> = [],
): ManualExpenseWriteThroughStorage & {
  addManualExpense: ReturnType<typeof vi.fn>;
  removeManualExpense: ReturnType<typeof vi.fn>;
} {
  return {
    manualExpenses,
    addManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
  } as ManualExpenseWriteThroughStorage & {
    addManualExpense: ReturnType<typeof vi.fn>;
    removeManualExpense: ReturnType<typeof vi.fn>;
  };
}

function commitResponse(
  overrides: Partial<ImportCommitResponse> = {},
): ImportCommitResponse {
  return {
    batchId: 7,
    created: 2,
    linked: 0,
    skipped: { monoMatched: 0, duplicate: 0 },
    // Порожній `rows` = сервер ще не вміє per-row результати (окремі
    // деплої web/server) — легасі-шлях через `getImportBatch`.
    rows: [],
    ...overrides,
  };
}

const rows: ImportCommitRequest["rows"] = [
  {
    date: "2026-08-01",
    amountKopiykas: 15000,
    direction: "expense",
    description: "Сільпо",
    category: "groceries",
  },
  {
    date: "2026-08-02",
    amountKopiykas: 500000,
    direction: "income",
    description: "Зарплата",
    category: "salary",
  },
];

beforeEach(() => {
  analyzeImportScreenshotMock.mockReset();
  previewImportStatementMock.mockReset();
  commitImportMock.mockReset();
  getImportBatchMock.mockReset();
  deleteImportBatchMock.mockReset();
  pullOnceMock.mockReset();
  pullOnceMock.mockResolvedValue({ pulled: 0 });
  bootSyncEngineReaderMock.mockReset();
  bootSyncEngineReaderMock.mockResolvedValue({ pullOnce: pullOnceMock });
});

describe("useImportCommit — легасі write-through (сервер без per-row rows)", () => {
  it("writes through every created row when nothing was skipped", async () => {
    commitImportMock.mockResolvedValue(commitResponse());
    getImportBatchMock.mockResolvedValue({
      batch: {
        id: 7,
        source: "bank_statement",
        status: "completed",
        rowsTotal: 2,
        rowsCreated: 2,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: ["imp1:aaa", "imp1:bbb"],
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z",
      },
    });
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    let resolved:
      Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        source: "bank_statement",
        rows,
      });
    });

    expect(getImportBatchMock).toHaveBeenCalledWith(7);
    expect(storage.addManualExpense).toHaveBeenCalledTimes(2);
    // Undo needs exactly these ids to reverse the write-through later
    // (`useImportBatchUndo`) — assert the commit result surfaces them.
    expect(resolved?.locallyWrittenIds).toEqual(["imp1:aaa", "imp1:bbb"]);
    expect(storage.addManualExpense).toHaveBeenNthCalledWith(1, {
      id: "imp1:aaa",
      date: "2026-08-01",
      description: "Сільпо",
      amount: 150,
      category: "groceries",
      kind: "expense",
    });
    expect(storage.addManualExpense).toHaveBeenNthCalledWith(2, {
      id: "imp1:bbb",
      date: "2026-08-02",
      description: "Зарплата",
      amount: 5000,
      category: "salary",
      kind: "income",
    });
  });

  it("does NOT write through (or fetch the batch) when any row was skipped", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({ created: 1, skipped: { monoMatched: 1, duplicate: 0 } }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ source: "bank_statement", rows });
    });

    expect(getImportBatchMock).not.toHaveBeenCalled();
    expect(storage.addManualExpense).not.toHaveBeenCalled();
  });

  it("does nothing when created is 0", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({ created: 0, skipped: { monoMatched: 0, duplicate: 2 } }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ source: "bank_statement", rows });
    });

    expect(getImportBatchMock).not.toHaveBeenCalled();
    expect(storage.addManualExpense).not.toHaveBeenCalled();
  });

  it("skips a row whose id is already present locally (dedupe guard)", async () => {
    commitImportMock.mockResolvedValue(commitResponse());
    getImportBatchMock.mockResolvedValue({
      batch: {
        id: 7,
        source: "bank_statement",
        status: "completed",
        rowsTotal: 2,
        rowsCreated: 2,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: ["imp1:aaa", "imp1:bbb"],
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z",
      },
    });
    const storage = makeStorage([{ id: "imp1:aaa" }]);
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ source: "bank_statement", rows });
    });

    expect(storage.addManualExpense).toHaveBeenCalledTimes(1);
    expect(storage.addManualExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "imp1:bbb" }),
    );
  });

  it("does not fail the commit when the follow-up getImportBatch call fails", async () => {
    commitImportMock.mockResolvedValue(commitResponse());
    getImportBatchMock.mockRejectedValue(new Error("network"));
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ source: "bank_statement", rows }),
      ).resolves.toMatchObject({ batchId: 7 });
    });
    expect(storage.addManualExpense).not.toHaveBeenCalled();
  });
});

/**
 * Регресія 2026-08-28: один пропущений рядок у батчі робив невидимими
 * ЛОКАЛЬНО всі створені рядки цього імпорту («пише, що вони вже є, а в
 * операціях їх немає»). Per-row `response.rows` знімає це обмеження.
 */
describe("useImportCommit — per-row write-through (сервер із rows)", () => {
  const perRow = (statuses: string[]) =>
    statuses.map((status, i) => ({
      id: `imp1:${"abcdef"[i] ?? i}`,
      status,
    })) as ImportCommitResponse["rows"];

  it("пише створені рядки навіть коли інші пропущені — без getImportBatch", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({
        created: 1,
        skipped: { monoMatched: 1, duplicate: 0 },
        rows: perRow(["mono_matched", "created"]),
      }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    let resolved:
      Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        source: "bank_statement",
        rows,
      });
    });

    expect(getImportBatchMock).not.toHaveBeenCalled();
    expect(storage.addManualExpense).toHaveBeenCalledTimes(1);
    // Другий рядок запиту → другий результат: зіставлення позиційне.
    expect(storage.addManualExpense).toHaveBeenCalledWith({
      id: "imp1:b",
      date: "2026-08-02",
      description: "Зарплата",
      amount: 5000,
      category: "salary",
      kind: "income",
    });
    expect(resolved?.locallyWrittenIds).toEqual(["imp1:b"]);
  });

  it("НЕ пише локально duplicate/tombstoned/mono_matched рядки", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({
        created: 0,
        skipped: { monoMatched: 1, duplicate: 1 },
        rows: perRow(["duplicate", "mono_matched"]),
      }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    let resolved:
      Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        source: "bank_statement",
        rows,
      });
    });

    expect(storage.addManualExpense).not.toHaveBeenCalled();
    // Undo не має чіпати локально рядки, яких воно не створювало.
    expect(resolved?.locallyWrittenIds).toEqual([]);
  });

  it("просить позачерговий pull, коли є duplicate-рядки (їх видно лише через нього)", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({
        created: 1,
        skipped: { monoMatched: 0, duplicate: 1 },
        rows: perRow(["created", "duplicate"]),
      }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ source: "bank_statement", rows });
      await Promise.resolve();
    });

    expect(pullOnceMock).toHaveBeenCalledTimes(1);
  });

  it("не смикає pull, коли дублів немає", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({ created: 2, rows: perRow(["created", "created"]) }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ source: "bank_statement", rows });
      await Promise.resolve();
    });

    expect(pullOnceMock).not.toHaveBeenCalled();
  });

  it("збійний pull не валить імпорт", async () => {
    bootSyncEngineReaderMock.mockRejectedValue(new Error("offline"));
    commitImportMock.mockResolvedValue(
      commitResponse({
        created: 0,
        skipped: { monoMatched: 0, duplicate: 2 },
        rows: perRow(["duplicate", "duplicate"]),
      }),
    );
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ source: "bank_statement", rows }),
      ).resolves.toMatchObject({ batchId: 7 });
      await Promise.resolve();
    });
  });

  it("розбіжна довжина rows → легасі-шлях (не довіряємо частковому зіставленню)", async () => {
    commitImportMock.mockResolvedValue(
      commitResponse({ created: 2, rows: perRow(["created"]) }),
    );
    getImportBatchMock.mockResolvedValue({
      batch: {
        id: 7,
        source: "bank_statement",
        status: "completed",
        rowsTotal: 2,
        rowsCreated: 2,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: ["imp1:aaa", "imp1:bbb"],
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z",
      },
    });
    const storage = makeStorage();
    const { result } = renderHook(() => useImportCommit({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ source: "bank_statement", rows });
    });

    expect(getImportBatchMock).toHaveBeenCalledWith(7);
    expect(storage.addManualExpense).toHaveBeenCalledTimes(2);
  });
});

describe("useImportScreenshotAnalyze / useImportStatementPreview / useImportBatchUndo", () => {
  it("useImportScreenshotAnalyze delegates to apiClient.finyk.analyzeImportScreenshot", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: { docType: "bank_screenshot", bank: null, rows: [] },
    });
    const { result } = renderHook(() => useImportScreenshotAnalyze(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({
        image_base64: "abc",
        mime_type: "image/png",
      });
    });
    expect(analyzeImportScreenshotMock).toHaveBeenCalledWith({
      image_base64: "abc",
      mime_type: "image/png",
    });
  });

  it("useImportStatementPreview delegates to apiClient.finyk.previewImportStatement", async () => {
    previewImportStatementMock.mockResolvedValue({
      profile: "mono",
      needsMapping: false,
      rows: [],
      skipped: [],
    });
    const { result } = renderHook(() => useImportStatementPreview(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ csv_text: "a,b,c" });
    });
    expect(previewImportStatementMock).toHaveBeenCalledWith({
      csv_text: "a,b,c",
    });
  });

  it("useImportBatchUndo delegates to apiClient.finyk.deleteImportBatch", async () => {
    deleteImportBatchMock.mockResolvedValue({
      batch: {
        id: 7,
        source: "bank_statement",
        status: "undone",
        rowsTotal: 1,
        rowsCreated: 1,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: [],
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:05:00.000Z",
      },
      tombstoned: 1,
    });
    const storage = makeStorage();
    const { result } = renderHook(() => useImportBatchUndo({ storage }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ batchId: 7, localIds: [] });
    });
    expect(deleteImportBatchMock).toHaveBeenCalledWith(7);
  });

  it("useImportBatchUndo removes every locally write-through id AFTER the server delete succeeds", async () => {
    const calls: string[] = [];
    deleteImportBatchMock.mockImplementation(async () => {
      calls.push("delete");
      return {
        batch: {
          id: 7,
          source: "bank_statement",
          status: "undone",
          rowsTotal: 2,
          rowsCreated: 2,
          rowsLinked: 0,
          rowsSkipped: 0,
          createdRowIds: [],
          createdAt: "2026-08-17T10:00:00.000Z",
          updatedAt: "2026-08-17T10:05:00.000Z",
        },
        tombstoned: 2,
      };
    });
    const storage = makeStorage();
    storage.removeManualExpense.mockImplementation((id: string) =>
      calls.push(`remove:${id}`),
    );
    const { result } = renderHook(() => useImportBatchUndo({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        batchId: 7,
        localIds: ["imp1:aaa", "imp1:bbb"],
      });
    });

    expect(storage.removeManualExpense).toHaveBeenCalledTimes(2);
    expect(storage.removeManualExpense).toHaveBeenNthCalledWith(1, "imp1:aaa");
    expect(storage.removeManualExpense).toHaveBeenNthCalledWith(2, "imp1:bbb");
    // Ordering matters: local removal only after the server confirms the
    // batch is gone, so a failed delete never desyncs local state.
    expect(calls).toEqual(["delete", "remove:imp1:aaa", "remove:imp1:bbb"]);
  });

  it("useImportBatchUndo does NOT touch local storage when the server delete fails", async () => {
    deleteImportBatchMock.mockRejectedValue(new Error("network"));
    const storage = makeStorage();
    const { result } = renderHook(() => useImportBatchUndo({ storage }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ batchId: 7, localIds: ["imp1:aaa"] }),
      ).rejects.toThrow("network");
    });

    expect(storage.removeManualExpense).not.toHaveBeenCalled();
  });
});
