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

// Кап commit-у 3 замість 1000: таблиця на 2500 рядків у jsdom рендериться
// хвилинами. Справжнє число (1000) звіряє `commitChunks.test.ts`.
vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return { ...actual, IMPORT_COMMIT_MAX_ROWS: 3 };
});

import { safeWriteLS } from "@shared/lib/storage/storage";
import { BulkImportSheet } from "./BulkImportSheet";
import { FINYK_PHOTO_PRIVACY_ACK_KEY } from "../receiptScan/FinykPhotoPrivacyNotice";
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

function renderSheet(
  customCategories: Parameters<
    typeof BulkImportSheet
  >[0]["customCategories"] = [],
  initiallyOpen = true,
) {
  const storage = makeStorage();
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <BulkImportSheet
        open={initiallyOpen}
        onClose={onClose}
        storage={storage}
        customCategories={customCategories}
      />
    </QueryClientProvider>,
  );
  return {
    storage,
    onClose,
    setOpen(open: boolean) {
      // Re-render through the same provider so closing and reopening exercises
      // the sheet's real reset effect rather than remounting a fresh instance.
      rerender(
        <QueryClientProvider client={client}>
          <BulkImportSheet
            open={open}
            onClose={onClose}
            storage={storage}
            customCategories={customCategories}
          />
        </QueryClientProvider>,
      );
    },
  };
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
  // Більшість тестів перевіряє сам vision-флоу, тож нотіс уже підтверджено;
  // гейт приватності має власний describe нижче й скидає ack.
  safeWriteLS(FINYK_PHOTO_PRIVACY_ACK_KEY, true);
});

describe("BulkImportSheet — нарізка commit-у на частини (ux-07)", () => {
  async function reachReviewWith(count: number) {
    previewImportStatementMock.mockResolvedValue({
      profile: "mono",
      needsMapping: false,
      rows: Array.from({ length: count }, (_, i) => ({
        date: "2026-08-01",
        amountKopiykas: 100 + i,
        direction: "expense",
        description: `BIG-${i}`,
        occurrenceIndex: 0,
      })),
      skipped: [],
    });
    const helpers = renderSheet();
    await act(async () => {
      fireEvent.change(fileInputFor(/виписку файлом/i), {
        target: { files: [new File(["x"], "big.csv", { type: "text/csv" })] },
      });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Імпортувати" }),
      ).toBeInTheDocument(),
    );
    return helpers;
  }

  let nextBatchId = 100;
  function okCommit(body: { rows: { description: string }[] }) {
    const batchId = nextBatchId++;
    return Promise.resolve({
      batchId,
      created: body.rows.length,
      linked: 0,
      skipped: { monoMatched: 0, duplicate: 0 },
      rows: body.rows.map((r) => ({
        id: `imp1:${r.description}`,
        status: "created",
      })),
    });
  }

  const sentRows = (call: number) =>
    (commitImportMock.mock.calls[call]?.[0] as { rows: unknown[] }).rows;

  it("8 вибраних: три commit-и по ≤3 (кап) з тим самим profile, підсумок сумує частини", async () => {
    commitImportMock.mockImplementation(okCommit);
    await reachReviewWith(8);

    const button = screen.getByRole("button", { name: "Імпортувати" });
    expect(button).toBeEnabled();
    expect(
      screen.getByText("Імпорт піде частинами по 3 рядків."),
    ).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByText("Створено: 8")).toBeInTheDocument(),
    );
    expect(commitImportMock).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((i) => sentRows(i).length)).toEqual([3, 3, 2]);
    for (const [body] of commitImportMock.mock.calls) {
      expect(body).toMatchObject({ source: "bank_statement", profile: "mono" });
    }
    // Номер повтору з превʼю їде в кожній частині без змін (data-29).
    expect(sentRows(2)[0]).toMatchObject({ occurrenceIndex: 0 });
  });

  it("рівно кап (3) вибрано: один commit, підказки немає", async () => {
    commitImportMock.mockImplementation(okCommit);
    await reachReviewWith(3);
    expect(screen.queryByText(/Імпорт піде частинами/)).not.toBeInTheDocument();
    // Регіон змонтований заздалегідь (порожній), щоб прогрес озвучився.
    expect(document.getElementById("bulk-import-cap-hint")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(screen.getByText("Створено: 3")).toBeInTheDocument(),
    );
    expect(commitImportMock).toHaveBeenCalledTimes(1);
  });

  it("показує прогрес «Імпортую частину k з n…» під час commit-у", async () => {
    let release: () => void = () => {};
    commitImportMock.mockImplementationOnce(
      (body: { rows: { description: string }[] }) =>
        new Promise((resolve) => {
          release = () => resolve(okCommit(body));
        }),
    );
    commitImportMock.mockImplementation(okCommit);
    await reachReviewWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(document.getElementById("bulk-import-cap-hint")).toHaveTextContent(
        "Імпортую частину 1 з 2…",
      ),
    );
    await act(async () => release());
    await waitFor(() =>
      expect(screen.getByText("Створено: 5")).toBeInTheDocument(),
    );
  });

  it("збій другої частини: пояснення, імпортоване зникає з таблиці, повтор досилає лише решту", async () => {
    commitImportMock
      .mockImplementationOnce(okCommit)
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementation(okCommit);
    await reachReviewWith(5);

    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Імпортовано рядків: 3 з 5. Решта не пішла: network down. Натисни «Імпортувати» ще раз, щоб дослати решту.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/network down\. Натисни «Імпортувати» ще раз/),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("BIG-0")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("BIG-3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(screen.getByText("Створено: 5")).toBeInTheDocument(),
    );
    expect(commitImportMock).toHaveBeenCalledTimes(3);
    expect(sentRows(2)).toHaveLength(2);
    expect(sentRows(2)[0]).toMatchObject({ description: "BIG-3" });
  });

  it("«Скасувати імпорт» скасовує кожен батч і прибирає їхні локальні рядки", async () => {
    nextBatchId = 100;
    commitImportMock.mockImplementation(okCommit);
    deleteImportBatchMock.mockResolvedValue({ batch: null, tombstoned: 1 });
    const { storage, onClose } = await reachReviewWith(4);
    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(screen.getByText("Створено: 4")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати імпорт" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deleteImportBatchMock.mock.calls.map((c) => c[0])).toEqual([
      100, 101,
    ]);
    expect(storage.removeManualExpense).toHaveBeenCalledWith("imp1:BIG-0");
    expect(storage.removeManualExpense).toHaveBeenCalledWith("imp1:BIG-3");
  });

  it("збій undo другого батчу: повтор добиває лише його", async () => {
    nextBatchId = 200;
    commitImportMock.mockImplementation(okCommit);
    deleteImportBatchMock
      .mockResolvedValueOnce({ batch: null, tombstoned: 1 })
      .mockRejectedValueOnce(new Error("undo down"))
      .mockResolvedValue({ batch: null, tombstoned: 1 });
    const { onClose } = await reachReviewWith(4);
    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() =>
      expect(screen.getByText("Створено: 4")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати імпорт" }));
    await waitFor(() =>
      expect(screen.getByText("undo down")).toBeInTheDocument(),
    );
    // Перший батч (3) скасовано, лишився другий (1).
    expect(screen.getByText("Створено: 1")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Скасувати імпорт" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deleteImportBatchMock.mock.calls.map((c) => c[0])).toEqual([
      200, 201, 201,
    ]);
  });
});

describe("BulkImportSheet — напрям рядка в перевірці (logic-06)", () => {
  it("Дебет, прочитаний як надходження: перемикач робить рядок витратою, і commit іде з expense та витратною категорією", async () => {
    previewImportStatementMock.mockResolvedValue({
      profile: "custom",
      needsMapping: false,
      rows: [
        {
          date: "2026-09-21",
          amountKopiykas: 35000,
          direction: "income",
          description: "ДК-1 Сільпо",
          occurrenceIndex: 0,
        },
      ],
      skipped: [],
    });
    commitImportMock.mockResolvedValue({
      batchId: 5,
      created: 1,
      linked: 0,
      skipped: { monoMatched: 0, duplicate: 0 },
      rows: [{ id: "imp1:x", status: "created" }],
    });
    renderSheet();
    await act(async () => {
      fireEvent.change(fileInputFor(/виписку файлом/i), {
        target: { files: [new File(["x"], "dk.csv", { type: "text/csv" })] },
      });
    });
    const toggle = await screen.findByRole("button", {
      name: /Напрям: надходження\. Змінити на «витрата»/,
    });
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", {
        name: /Напрям: витрата\. Змінити на «надходження»/,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вибрати рядок" }));
    fireEvent.click(screen.getByRole("button", { name: "Імпортувати" }));
    await waitFor(() => expect(commitImportMock).toHaveBeenCalledTimes(1));
    const [sent] = (
      commitImportMock.mock.calls[0]?.[0] as {
        rows: Record<string, unknown>[];
      }
    ).rows;
    expect(sent).toMatchObject({ direction: "expense", category: "other" });
    expect(sent).not.toHaveProperty("occurrenceIndex");
  });
});
