// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptDraft, ReceiptSaveResponse } from "@sergeant/api-client";

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
        saveReceipt: (...args: unknown[]) => saveReceiptMock(...args),
      },
    },
  };
});

import { useReceiptSave, type ReceiptSaveStorageSlice } from "./useReceiptSave";

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

function visionDraft(overrides: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-08-17T10:00:00+03:00",
    totalKopiykas: 15075,
    items: [],
    confidence: 0.9,
    rawPayload: { note: "test" },
    ...overrides,
  };
}

function dpsDraft(overrides: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    source: "dps",
    fiscalNum: "4000123456",
    store: "АТБ",
    storeTaxId: "12345678",
    purchasedAt: "2026-08-17T10:00:00+03:00",
    totalKopiykas: 5000,
    items: [],
    confidence: null,
    rawPayload: { xml: "<CHECK/>" },
    ...overrides,
  };
}

function saveResponse(
  overrides: Partial<ReceiptSaveResponse["receipt"]> = {},
): ReceiptSaveResponse {
  return {
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
      link: { txKind: "manual", txRef: "expense-uuid-1" },
      createdAt: "2026-08-17T10:00:01.000Z",
      updatedAt: "2026-08-17T10:00:01.000Z",
      ...overrides,
    },
  };
}

function makeStorage(
  overrides: Partial<ReceiptSaveStorageSlice> = {},
): ReceiptSaveStorageSlice & { addManualExpense: ReturnType<typeof vi.fn> } {
  return {
    manualExpenses: [],
    addManualExpense: vi.fn(),
    ...overrides,
  } as ReceiptSaveStorageSlice & { addManualExpense: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  saveReceiptMock.mockReset();
});

describe("useReceiptSave — clientScanId contract", () => {
  it("generates one uuid per attempt and reuses it on retry of the SAME draft object", async () => {
    saveReceiptMock
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(saveResponse());

    const storage = makeStorage();
    const onReceiptLinked = vi.fn();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked }),
      { wrapper: makeWrapper() },
    );

    const draft = visionDraft();

    await act(async () => {
      await expect(result.current.saveReceipt(draft, "food")).rejects.toThrow();
    });
    await act(async () => {
      await result.current.saveReceipt(draft, "food");
    });

    expect(saveReceiptMock).toHaveBeenCalledTimes(2);
    const firstBody = saveReceiptMock.mock.calls[0]?.[0];
    const secondBody = saveReceiptMock.mock.calls[1]?.[0];
    expect(firstBody.clientScanId).toEqual(expect.any(String));
    expect(secondBody.clientScanId).toBe(firstBody.clientScanId);
  });

  it("generates a DIFFERENT uuid for a new (different-reference) draft", async () => {
    saveReceiptMock.mockResolvedValue(saveResponse());
    const storage = makeStorage();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.saveReceipt(visionDraft(), "food");
    });
    await act(async () => {
      await result.current.saveReceipt(visionDraft(), "food");
    });

    const firstId = saveReceiptMock.mock.calls[0]?.[0].clientScanId;
    const secondId = saveReceiptMock.mock.calls[1]?.[0].clientScanId;
    expect(firstId).toEqual(expect.any(String));
    expect(secondId).toEqual(expect.any(String));
    expect(secondId).not.toBe(firstId);
  });

  it("does not attach clientScanId for a DPS/QR draft (fiscalNum present)", async () => {
    saveReceiptMock.mockResolvedValue(
      saveResponse({ source: "dps", fiscalNum: "4000123456" }),
    );
    const storage = makeStorage();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.saveReceipt(dpsDraft(), "food");
    });

    const body = saveReceiptMock.mock.calls[0]?.[0];
    expect(body.clientScanId).toBeUndefined();
  });
});

describe("useReceiptSave — local visibility write-through", () => {
  it("writes through to storage.addManualExpense for a manual link, using the Kyiv day-key + hryvnia amount", async () => {
    saveReceiptMock.mockResolvedValue(
      saveResponse({
        id: 42,
        store: "Сільпо",
        purchasedAt: "2026-08-16T22:30:00.000Z", // 2026-08-17 01:30 Kyiv (EEST +3)
        totalKopiykas: 15075,
        link: { txKind: "manual", txRef: "expense-uuid-1" },
      }),
    );
    const storage = makeStorage();
    const onReceiptLinked = vi.fn();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.saveReceipt(visionDraft(), "groceries");
    });

    expect(onReceiptLinked).toHaveBeenCalledWith("expense-uuid-1", 42);
    expect(storage.addManualExpense).toHaveBeenCalledWith({
      id: "expense-uuid-1",
      date: "2026-08-17",
      description: "Сільпо",
      amount: 150.75,
      category: "groceries",
      kind: "expense",
    });
  });

  it("does NOT write through for a mono-linked receipt (already visible via mono sync)", async () => {
    saveReceiptMock.mockResolvedValue(
      saveResponse({ link: { txKind: "mono", txRef: "mono-tx-1" } }),
    );
    const storage = makeStorage();
    const onReceiptLinked = vi.fn();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.saveReceipt(dpsDraft(), "food");
    });

    expect(onReceiptLinked).toHaveBeenCalledWith("mono-tx-1", 1);
    expect(storage.addManualExpense).not.toHaveBeenCalled();
  });

  it("skips the write-through when the id is already present locally (dedupe guard for alreadyExists replay)", async () => {
    saveReceiptMock.mockResolvedValue(
      saveResponse({ link: { txKind: "manual", txRef: "expense-uuid-1" } }),
    );
    const storage = makeStorage({ manualExpenses: [{ id: "expense-uuid-1" }] });
    const onReceiptLinked = vi.fn();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.saveReceipt(visionDraft(), "food");
    });

    // Still records the link (drill-down should still work) but does not
    // double-insert the manual expense row.
    expect(onReceiptLinked).toHaveBeenCalledWith("expense-uuid-1", 1);
    expect(storage.addManualExpense).not.toHaveBeenCalled();
  });

  it("does nothing extra when the response link is null (defensive — should not normally happen)", async () => {
    saveReceiptMock.mockResolvedValue(saveResponse({ link: null }));
    const storage = makeStorage();
    const onReceiptLinked = vi.fn();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.saveReceipt(visionDraft(), "food");
    });

    expect(onReceiptLinked).not.toHaveBeenCalled();
    expect(storage.addManualExpense).not.toHaveBeenCalled();
  });
});

describe("useReceiptSave — pending/error state", () => {
  it("exposes isSaving while the mutation is in flight", async () => {
    let resolveFn: ((v: ReceiptSaveResponse) => void) | undefined;
    saveReceiptMock.mockReturnValue(
      new Promise<ReceiptSaveResponse>((resolve) => {
        resolveFn = resolve;
      }),
    );
    const storage = makeStorage();
    const { result } = renderHook(
      () => useReceiptSave({ storage, onReceiptLinked: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isSaving).toBe(false);
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.saveReceipt(visionDraft(), "food");
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveFn?.(saveResponse());
    await act(async () => {
      await pending;
    });
    // `mutateAsync`'s promise resolves in the same microtask queue turn as
    // the mutation's internal state transition, but React's commit for that
    // last `isPending: false` flip can land one tick later — waitFor gives
    // it that room instead of asserting synchronously right after `await`.
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
