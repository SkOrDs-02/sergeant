// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeImportScreenshotMock = vi.fn();
const previewImportStatementMock = vi.fn();
const commitImportMock = vi.fn();
const getImportBatchMock = vi.fn();
const deleteImportBatchMock = vi.fn();
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
        analyzeImportScreenshot: (...args: unknown[]) =>
          analyzeImportScreenshotMock(...args),
        previewImportStatement: (...args: unknown[]) =>
          previewImportStatementMock(...args),
        commitImport: (...args: unknown[]) => commitImportMock(...args),
        getImportBatch: (...args: unknown[]) => getImportBatchMock(...args),
        deleteImportBatch: (...args: unknown[]) =>
          deleteImportBatchMock(...args),
        lookupReceipt: (...args: unknown[]) => lookupReceiptMock(...args),
        analyzeReceipt: (...args: unknown[]) => analyzeReceiptMock(...args),
        saveReceipt: (...args: unknown[]) => saveReceiptMock(...args),
      },
    },
  };
});

vi.mock("../../hooks/useReceiptQrScanner", () => ({
  decodeQrFromImageFile: vi.fn().mockResolvedValue(null),
}));

import { BulkImportSheet } from "./BulkImportSheet";
import type { ManualExpenseWriteThroughStorage } from "../../hooks/manualExpenseWriteThrough";

function makeStorage(): ManualExpenseWriteThroughStorage & {
  addManualExpense: ReturnType<typeof vi.fn>;
  removeManualExpense: ReturnType<typeof vi.fn>;
} {
  return {
    manualExpenses: [],
    addManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
  } as ManualExpenseWriteThroughStorage & {
    addManualExpense: ReturnType<typeof vi.fn>;
    removeManualExpense: ReturnType<typeof vi.fn>;
  };
}

function renderSheet() {
  const storage = makeStorage();
  const onClose = vi.fn();
  const onReceiptLinked = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BulkImportSheet
        open
        onClose={onClose}
        storage={storage}
        onReceiptLinked={onReceiptLinked}
      />
    </QueryClientProvider>,
  );
  return { storage, onClose, onReceiptLinked };
}

function fileInputFor(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

beforeEach(() => {
  analyzeImportScreenshotMock.mockReset();
  previewImportStatementMock.mockReset();
  commitImportMock.mockReset();
  getImportBatchMock.mockReset();
  deleteImportBatchMock.mockReset();
  lookupReceiptMock.mockReset();
  analyzeReceiptMock.mockReset();
  saveReceiptMock.mockReset();
});

describe("BulkImportSheet — cap на батч фото", () => {
  function elevenFiles(): File[] {
    return Array.from(
      { length: 11 },
      (_, i) =>
        new File([new Uint8Array(10)], `r${i}.jpg`, { type: "image/jpeg" }),
    );
  }

  it("вибір понад 10 фото показує примітку і реально обробляє РІВНО 10", async () => {
    analyzeReceiptMock.mockResolvedValue({
      draft: {
        source: "vision",
        fiscalNum: null,
        store: "",
        storeTaxId: null,
        purchasedAt: "2026-08-17T10:00:00.000Z",
        totalKopiykas: 1000,
        items: [],
        confidence: 0.9,
        rawPayload: {},
      },
    });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/фото чеків/i), {
        target: { files: elevenFiles() },
      });
    });

    expect(screen.getByText(/Взято перші 10 фото з 11/)).toBeInTheDocument();
    // 11-й файл (r10.jpg) НЕ обробляється: рядок прогресу не рендериться,
    // analyze викликано рівно 10 разів (slice у startFiles).
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(10));
    expect(screen.queryByText("r10.jpg")).not.toBeInTheDocument();
  });

  it("примітка про кап зникає після закриття і повторного відкриття шита", async () => {
    const storage = makeStorage();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const sheet = (open: boolean) => (
      <QueryClientProvider client={client}>
        <BulkImportSheet
          open={open}
          onClose={vi.fn()}
          storage={storage}
          onReceiptLinked={vi.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(sheet(true));

    await act(async () => {
      fireEvent.change(fileInputFor(/фото чеків/i), {
        target: { files: elevenFiles() },
      });
    });
    expect(screen.getByText(/Взято перші 10 фото з 11/)).toBeInTheDocument();

    rerender(sheet(false));
    // Reset-on-close — відкладений мікротаск (див. ефект у компоненті).
    await act(async () => {
      await Promise.resolve();
    });
    rerender(sheet(true));
    expect(
      screen.queryByText(/Взято перші 10 фото з 11/),
    ).not.toBeInTheDocument();
  });
});

describe("BulkImportSheet — choose stage", () => {
  it("renders all three entry actions", () => {
    renderSheet();
    expect(
      screen.getByRole("button", { name: /Кілька фото чеків/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Скрін банкінгу/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CSV-виписка/ }),
    ).toBeInTheDocument();
  });
});

describe("BulkImportSheet — screenshot path", () => {
  it("bank_screenshot rows land in bulk-review", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: {
        docType: "bank_screenshot",
        bank: "mono",
        rows: [
          {
            date: "2026-08-01",
            time: "10:00",
            amountKopiykas: 15000,
            direction: "expense",
            description: "Сільпо",
            confidence: 0.9,
          },
        ],
      },
    });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/скрін банкінгу/i), {
        target: {
          files: [
            new File([new Uint8Array(10)], "s.png", { type: "image/png" }),
          ],
        },
      });
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("Сільпо")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Імпортувати" }),
    ).toBeInTheDocument();
  });

  it("docType: receipt shows guidance to use the single-receipt flow instead", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: { docType: "receipt", bank: null, rows: [] },
    });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/скрін банкінгу/i), {
        target: {
          files: [
            new File([new Uint8Array(10)], "s.png", { type: "image/png" }),
          ],
        },
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/Сканувати чек/)).toBeInTheDocument(),
    );
  });

  it("docType: other shows an unrecognised-screen error", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: { docType: "other", bank: null, rows: [] },
    });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/скрін банкінгу/i), {
        target: {
          files: [
            new File([new Uint8Array(10)], "s.png", { type: "image/png" }),
          ],
        },
      });
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Не вдалось розпізнати транзакції/),
      ).toBeInTheDocument(),
    );
  });
});

describe("BulkImportSheet — CSV path", () => {
  it("a recognised profile (needsMapping: false) goes straight to bulk-review, with the skipped-row summary", async () => {
    previewImportStatementMock.mockResolvedValue({
      profile: "mono",
      needsMapping: false,
      rows: [
        {
          date: "2026-08-01",
          amountKopiykas: 25000,
          direction: "expense",
          description: "АТБ",
        },
      ],
      skipped: [{ line: 4, reason: "not_uah" }],
    });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/CSV-виписку/i), {
        target: {
          files: [
            new File(["date,amount\n2026-08-01,-250"], "mono.csv", {
              type: "text/csv",
            }),
          ],
        },
      });
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("АТБ")).toBeInTheDocument(),
    );
    expect(screen.getByText(/не гривня/)).toBeInTheDocument();
  });

  it("an unrecognised format opens the column mapper, then re-previews with the chosen mapping", async () => {
    previewImportStatementMock
      .mockResolvedValueOnce({
        profile: null,
        needsMapping: true,
        headers: ["Дата", "Сума", "Опис"],
        sampleRows: [["01.08.2026", "-100", "Кава"]],
        rows: [],
        skipped: [],
      })
      .mockResolvedValueOnce({
        profile: "custom",
        needsMapping: false,
        rows: [
          {
            date: "2026-08-01",
            amountKopiykas: 10000,
            direction: "expense",
            description: "Кава",
          },
        ],
        skipped: [],
      });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/CSV-виписку/i), {
        target: {
          files: [new File(["a,b,c"], "unknown.csv", { type: "text/csv" })],
        },
      });
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Продовжити" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));

    await waitFor(() =>
      expect(screen.getByDisplayValue("Кава")).toBeInTheDocument(),
    );
    expect(previewImportStatementMock).toHaveBeenCalledTimes(2);
    expect(previewImportStatementMock.mock.calls[1]?.[0]).toMatchObject({
      mapping: expect.objectContaining({
        dateCol: "Дата",
        amountCol: "Сума",
        descriptionCol: "Опис",
      }),
    });
  });

  it("keeps the mapper mounted (and its column picks intact) when the re-preview submit fails", async () => {
    previewImportStatementMock
      .mockResolvedValueOnce({
        profile: null,
        needsMapping: true,
        headers: ["A", "B", "C"],
        sampleRows: [["x", "y", "z"]],
        rows: [],
        skipped: [],
      })
      // Not an `Error`/`ApiError`/string shape — `formatApiError` falls all
      // the way through to the caller's `fallback` text (see
      // `apiErrorFormat.ts`), which is what this test asserts on below.
      .mockRejectedValueOnce({});
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/CSV-виписку/i), {
        target: {
          files: [new File(["a,b,c"], "unknown.csv", { type: "text/csv" })],
        },
      });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Продовжити" }),
      ).toBeInTheDocument(),
    );

    // Pick a NON-default column — the bug this guards against remounted the
    // mapper with fresh `useState` defaults on a failed re-preview, silently
    // discarding whatever the user had just chosen.
    fireEvent.change(screen.getByLabelText("Колонка дати"), {
      target: { value: "C" },
    });
    expect(screen.getByLabelText("Колонка дати")).toHaveValue("C");

    fireEvent.click(screen.getByRole("button", { name: "Продовжити" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Не вдалось прочитати виписку/),
      ).toBeInTheDocument(),
    );
    // Still on the mapper stage, and the user's pick survived the failed
    // round-trip — proof the component never unmounted.
    expect(
      screen.getByRole("button", { name: "Продовжити" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Колонка дати")).toHaveValue("C");
  });
});

describe("BulkImportSheet — commit + undo", () => {
  async function reachBulkReview() {
    previewImportStatementMock.mockResolvedValue({
      profile: "mono",
      needsMapping: false,
      rows: [
        {
          date: "2026-08-01",
          amountKopiykas: 25000,
          direction: "expense",
          description: "АТБ",
        },
      ],
      skipped: [],
    });
    const helpers = renderSheet();
    await act(async () => {
      fireEvent.change(fileInputFor(/CSV-виписку/i), {
        target: { files: [new File(["x"], "mono.csv", { type: "text/csv" })] },
      });
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("АТБ")).toBeInTheDocument(),
    );
    return helpers;
  }

  it("commit shows the created/skipped summary and an undo button", async () => {
    commitImportMock.mockResolvedValue({
      batchId: 9,
      created: 1,
      linked: 0,
      skipped: { monoMatched: 0, duplicate: 0 },
    });
    getImportBatchMock.mockResolvedValue({
      batch: {
        id: 9,
        source: "bank_statement",
        status: "completed",
        rowsTotal: 1,
        rowsCreated: 1,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: ["imp1:aaa"],
        createdAt: "x",
        updatedAt: "x",
      },
    });
    await reachBulkReview();

    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));

    await waitFor(() =>
      expect(screen.getByText("Створено: 1")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Скасувати імпорт" }),
    ).toBeInTheDocument();
  });

  it("undo calls deleteImportBatch with the batchId and closes the sheet", async () => {
    commitImportMock.mockResolvedValue({
      batchId: 9,
      created: 1,
      linked: 0,
      skipped: { monoMatched: 0, duplicate: 0 },
    });
    getImportBatchMock.mockResolvedValue({
      batch: {
        id: 9,
        source: "bank_statement",
        status: "completed",
        rowsTotal: 1,
        rowsCreated: 1,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: ["imp1:aaa"],
        createdAt: "x",
        updatedAt: "x",
      },
    });
    deleteImportBatchMock.mockResolvedValue({
      batch: {
        id: 9,
        source: "bank_statement",
        status: "undone",
        rowsTotal: 1,
        rowsCreated: 1,
        rowsLinked: 0,
        rowsSkipped: 0,
        createdRowIds: ["imp1:aaa"],
        createdAt: "x",
        updatedAt: "y",
      },
      tombstoned: 1,
    });
    const { onClose, storage } = await reachBulkReview();

    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(screen.getByText("Створено: 1")).toBeInTheDocument(),
    );
    // Write-through happened as part of commit (noSkips path) — confirm the
    // local row landed BEFORE undo, so the undo assertion below proves a
    // real removal, not an already-absent id.
    expect(storage.addManualExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "imp1:aaa" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати імпорт" }));
    await waitFor(() => expect(deleteImportBatchMock).toHaveBeenCalledWith(9));
    // The undo must mirror the write-through: the same id that commit added
    // locally is removed once the server confirms the batch is gone —
    // otherwise it survives as a phantom row the server no longer knows
    // about (§ докстрінг `useBulkImport.ts`).
    expect(storage.removeManualExpense).toHaveBeenCalledWith("imp1:aaa");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not show an undo button when nothing was created (skipped==all)", async () => {
    commitImportMock.mockResolvedValue({
      batchId: 9,
      created: 0,
      linked: 0,
      skipped: { monoMatched: 1, duplicate: 0 },
    });
    await reachBulkReview();

    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));

    await waitFor(() =>
      expect(screen.getByText("Створено: 0")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Скасувати імпорт" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/вже є в mono/)).toBeInTheDocument();
  });
});

describe("BulkImportSheet — batch receipts path", () => {
  it("selecting multiple photos routes to the receipts-progress stage", async () => {
    analyzeReceiptMock.mockResolvedValue({
      draft: {
        source: "vision",
        fiscalNum: null,
        store: "Сільпо",
        storeTaxId: null,
        purchasedAt: "2026-08-17T10:00:00.000Z",
        totalKopiykas: 1000,
        items: [],
        confidence: 0.9,
        rawPayload: {},
      },
    });
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/фото чеків/i), {
        target: {
          files: [
            new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }),
          ],
        },
      });
    });

    await waitFor(() => expect(screen.getByText("Сільпо")).toBeInTheDocument());
  });
});
