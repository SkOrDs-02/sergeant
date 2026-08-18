// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptDraft } from "@sergeant/api-client";

const lookupReceiptMock = vi.fn();
const analyzeReceiptMock = vi.fn();
const saveReceiptMock = vi.fn();
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      finyk: {
        ...actual.apiClient.finyk,
        lookupReceipt: (...args: unknown[]) => lookupReceiptMock(...args),
        analyzeReceipt: (...args: unknown[]) => analyzeReceiptMock(...args),
        saveReceipt: (...args: unknown[]) => saveReceiptMock(...args),
      },
    },
  };
});

const decodeQrFromImageFileMock = vi.fn();
vi.mock("./useReceiptQrScanner", () => ({
  decodeQrFromImageFile: (...args: unknown[]) =>
    decodeQrFromImageFileMock(...args),
}));

import {
  BATCH_RECEIPTS_MAX_FILES,
  useBulkReceiptsImport,
} from "./useBulkReceiptsImport";
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

function makeFile(name: string): File {
  return new File([new Uint8Array(10)], name, { type: "image/jpeg" });
}

function draft(overrides: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-08-17T10:00:00.000Z",
    totalKopiykas: 15075,
    items: [],
    confidence: 0.9,
    rawPayload: {},
    ...overrides,
  };
}

function makeStorage(): ManualExpenseWriteThroughStorage & {
  addManualExpense: ReturnType<typeof vi.fn>;
} {
  return {
    manualExpenses: [],
    addManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
  } as ManualExpenseWriteThroughStorage & {
    addManualExpense: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  lookupReceiptMock.mockReset();
  analyzeReceiptMock.mockReset();
  saveReceiptMock.mockReset();
  decodeQrFromImageFileMock.mockReset();
});

describe("useBulkReceiptsImport — startFiles (drafting)", () => {
  it("uses the QR lookup path when a QR is found in the photo and parses as a DPS receipt", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(
      "https://cabinet.tax.gov.ua/cashregs/check?id=1&date=17082026&time=1000&fn=2&sm=3",
    );
    lookupReceiptMock.mockResolvedValue({
      draft: draft({ source: "dps", fiscalNum: "2" }),
    });

    const storage = makeStorage();
    const { result } = renderHook(
      () => useBulkReceiptsImport({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.startFiles([makeFile("a.jpg")]);
    });

    expect(lookupReceiptMock).toHaveBeenCalledWith({
      fn: "2",
      id: "1",
      date: "17082026",
      time: "1000",
      sm: "3",
    });
    expect(analyzeReceiptMock).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: "drafted" });
  });

  it("falls back to vision analyze when no QR is found in the photo", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({ draft: draft() });

    const storage = makeStorage();
    const { result } = renderHook(
      () => useBulkReceiptsImport({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.startFiles([makeFile("b.jpg")]);
    });

    expect(lookupReceiptMock).not.toHaveBeenCalled();
    expect(analyzeReceiptMock).toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe("drafted");
  });

  it("falls back to vision when a QR is found but the DPS lookup itself fails", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(
      "https://cabinet.tax.gov.ua/cashregs/check?id=1&date=17082026&time=1000&fn=2&sm=3",
    );
    lookupReceiptMock.mockRejectedValue(new Error("dps down"));
    analyzeReceiptMock.mockResolvedValue({ draft: draft() });

    const storage = makeStorage();
    const { result } = renderHook(
      () => useBulkReceiptsImport({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.startFiles([makeFile("c.jpg")]);
    });

    expect(analyzeReceiptMock).toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe("drafted");
  });

  it("marks a file as fetch-error (and excludes it) when analyze fails", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockRejectedValue(new Error("boom"));

    const storage = makeStorage();
    const { result } = renderHook(
      () => useBulkReceiptsImport({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.startFiles([makeFile("d.jpg")]);
    });

    expect(result.current.items[0]).toMatchObject({
      status: "fetch-error",
      included: false,
    });
    expect(result.current.items[0]?.error).toBeTruthy();
  });

  it("processes every file and caps the batch at BATCH_RECEIPTS_MAX_FILES", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({ draft: draft() });

    const files = Array.from({ length: BATCH_RECEIPTS_MAX_FILES + 5 }, (_, i) =>
      makeFile(`f${i}.jpg`),
    );
    const storage = makeStorage();
    const { result } = renderHook(
      () => useBulkReceiptsImport({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.startFiles(files);
    });

    expect(result.current.items).toHaveLength(BATCH_RECEIPTS_MAX_FILES);
    expect(analyzeReceiptMock).toHaveBeenCalledTimes(BATCH_RECEIPTS_MAX_FILES);
  });
});

describe("useBulkReceiptsImport — saveAll", () => {
  async function draftTwoItems() {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock
      .mockResolvedValueOnce({ draft: draft({ store: "Сільпо" }) })
      .mockResolvedValueOnce({ draft: draft({ store: "АТБ" }) });
    const storage = makeStorage();
    const { result } = renderHook(
      () => useBulkReceiptsImport({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.startFiles([makeFile("a.jpg"), makeFile("b.jpg")]);
    });
    return { result, storage };
  }

  it("saves every included, drafted item and tags alreadyExists distinctly", async () => {
    const { result } = await draftTwoItems();
    saveReceiptMock
      .mockResolvedValueOnce({
        alreadyExists: false,
        receipt: {
          id: 1,
          source: "vision",
          fiscalNum: null,
          store: "Сільпо",
          storeTaxId: null,
          purchasedAt: "2026-08-17T10:00:00.000Z",
          totalKopiykas: 15075,
          items: [],
          link: { txKind: "manual", txRef: "e1" },
          createdAt: "x",
          updatedAt: "x",
        },
      })
      .mockResolvedValueOnce({
        alreadyExists: true,
        receipt: {
          id: 2,
          source: "vision",
          fiscalNum: null,
          store: "АТБ",
          storeTaxId: null,
          purchasedAt: "2026-08-17T10:00:00.000Z",
          totalKopiykas: 15075,
          items: [],
          link: { txKind: "manual", txRef: "e2" },
          createdAt: "x",
          updatedAt: "x",
        },
      });

    await act(async () => {
      await result.current.saveAll();
    });

    expect(saveReceiptMock).toHaveBeenCalledTimes(2);
    expect(result.current.items[0]?.status).toBe("saved");
    expect(result.current.items[1]?.status).toBe("already-exists");
  });

  it("skips items the user excluded (toggleItemIncluded)", async () => {
    const { result } = await draftTwoItems();
    const firstId = result.current.items[0]!.id;
    act(() => {
      result.current.toggleItemIncluded(firstId);
    });
    await waitFor(() =>
      expect(result.current.items.find((i) => i.id === firstId)?.included).toBe(
        false,
      ),
    );

    saveReceiptMock.mockResolvedValue({
      alreadyExists: false,
      receipt: {
        id: 2,
        source: "vision",
        fiscalNum: null,
        store: "АТБ",
        storeTaxId: null,
        purchasedAt: "2026-08-17T10:00:00.000Z",
        totalKopiykas: 15075,
        items: [],
        link: { txKind: "manual", txRef: "e2" },
        createdAt: "x",
        updatedAt: "x",
      },
    });

    await act(async () => {
      await result.current.saveAll();
    });

    expect(saveReceiptMock).toHaveBeenCalledTimes(1);
  });

  it("marks an item save-error without aborting the rest of the batch", async () => {
    const { result } = await draftTwoItems();
    saveReceiptMock
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        alreadyExists: false,
        receipt: {
          id: 2,
          source: "vision",
          fiscalNum: null,
          store: "АТБ",
          storeTaxId: null,
          purchasedAt: "2026-08-17T10:00:00.000Z",
          totalKopiykas: 15075,
          items: [],
          link: { txKind: "manual", txRef: "e2" },
          createdAt: "x",
          updatedAt: "x",
        },
      });

    await act(async () => {
      await result.current.saveAll();
    });

    expect(result.current.items[0]?.status).toBe("save-error");
    expect(result.current.items[1]?.status).toBe("saved");
  });

  it("setItemCategory updates only the targeted item", async () => {
    const { result } = await draftTwoItems();
    const firstId = result.current.items[0]!.id;
    act(() => {
      result.current.setItemCategory(firstId, "groceries");
    });
    await waitFor(() =>
      expect(result.current.items.find((i) => i.id === firstId)?.category).toBe(
        "groceries",
      ),
    );
    expect(result.current.items[1]?.category).not.toBe("groceries");
  });
});
