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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BulkImportSheet open onClose={onClose} storage={storage} />
    </QueryClientProvider>,
  );
  return { storage, onClose };
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

describe("BulkImportSheet — choose stage", () => {
  it("рендерить дві банківські дії; фото-батч переїхав у «Сканувати чек»", () => {
    renderSheet();
    expect(
      screen.getByRole("button", { name: /Скрін банкінгу/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Виписка файлом/ }),
    ).toBeInTheDocument();
    // Бета-фідбек №2 (2026-08-18): «Кілька фото чеків» більше не тут —
    // батч живе в `ReceiptScanSheet` (multiple-пікер).
    expect(
      screen.queryByRole("button", { name: /Кілька фото чеків/ }),
    ).not.toBeInTheDocument();
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

  it("показує живий статус розпізнавання, поки vision у польоті", async () => {
    // Бета-фідбек №5 (2026-08-18): до цього аркуш усі 5–20 секунд стояв
    // на кнопках вибору файлу, і пауза читалась як завислий екран.
    let resolveAnalyze: (value: unknown) => void = () => {};
    analyzeImportScreenshotMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnalyze = resolve;
        }),
    );
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

    // Перша фаза — стиснення фото; вона встигає початись до будь-якої
    // мережі, і саме вона раніше проходила зовсім без сигналу.
    expect(screen.getByRole("status")).toHaveTextContent("Готую фото…");
    // Кнопки прибрані — інакше подвійний тап шле друге фото у той самий
    // аркуш поверх уже запущеного розпізнавання.
    expect(
      screen.queryByRole("button", { name: /Скрін банкінгу/ }),
    ).not.toBeInTheDocument();

    // Друга фаза настає рівно тоді, коли фото пішло на сервер.
    await waitFor(() => expect(analyzeImportScreenshotMock).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Розпізнаю транзакції…",
    );

    await act(async () => {
      resolveAnalyze({
        draft: {
          docType: "bank_screenshot",
          bank: "mono",
          rows: [
            {
              date: "2026-08-01",
              amountKopiykas: 15000,
              direction: "expense",
              description: "Сільпо",
              confidence: 0.9,
            },
          ],
        },
      });
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("Сільпо")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("невдале розпізнавання повертає на вибір файлу, а не лишає спінер", async () => {
    // Форма без `message`/`ApiError` — `formatApiError` доходить до
    // fallback-тексту виклику (той самий трюк, що в CSV-тесті нижче).
    analyzeImportScreenshotMock.mockRejectedValue({});
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
        screen.getByRole("button", { name: /Скрін банкінгу/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(/Не вдалось розпізнати скрін/)).toBeInTheDocument();
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

    // Шукаємо саме ПОВІДОМЛЕННЯ, а не будь-яку згадку «Сканувати чек»:
    // на екрані вибору файлу та сама фраза є у підказці внизу, тож
    // ширший матчер проходив ще до того, як помилка встигала зʼявитись
    // (і почав ловити обидва вузли, щойно стадія `processing` прибрала
    // підказку з екрана на час розпізнавання).
    await waitFor(() =>
      expect(
        screen.getByText(/Це схоже на чек, не скрін банкінгу/),
      ).toBeInTheDocument(),
    );
  });

  // Порожній результат мав ОДИН текст на всі причини — саме про це
  // бета-фідбек 2026-08-25 «ші написав, що не може знайти транзакції».
  // Три тести нижче фіксують, що кожна причина має власну дію.
  it("обірвана відповідь моделі радить розбити скрін на частини", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: {
        docType: "bank_screenshot",
        bank: "monobank",
        rows: [],
        dropped: { failed: 0, nonUah: 0, unreadable: 0 },
        truncated: true,
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
      expect(screen.getByText(/забагато операцій/i)).toBeInTheDocument(),
    );
  });

  it("не-гривневі рядки пояснюються валютою, а не «не бачу транзакцій»", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: {
        docType: "bank_screenshot",
        bank: "monobank",
        rows: [],
        dropped: { failed: 0, nonUah: 3, unreadable: 0 },
        truncated: false,
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
      expect(screen.getByText(/не в гривні/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/3 операції/)).toBeInTheDocument();
  });

  it("docType: other shows an unrecognised-screen error", async () => {
    analyzeImportScreenshotMock.mockResolvedValue({
      draft: {
        docType: "other",
        bank: null,
        rows: [],
        dropped: { failed: 0, nonUah: 0, unreadable: 0 },
        truncated: false,
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
      expect(
        screen.getByText(/не схоже на екран банківського застосунку/i),
      ).toBeInTheDocument(),
    );
    // Відмова = знову вибір файлу: помилка без шляху далі лишала б людину
    // на мертвому спінері.
    expect(
      screen.getByRole("button", { name: /Скрін банкінгу/ }),
    ).toBeInTheDocument();
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
      fireEvent.change(fileInputFor(/виписку файлом/i), {
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

  it("показує статус читання виписки, поки превʼю у польоті", async () => {
    let resolvePreview: (value: unknown) => void = () => {};
    previewImportStatementMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    renderSheet();

    await act(async () => {
      fireEvent.change(fileInputFor(/виписку файлом/i), {
        target: {
          files: [new File(["a,b"], "mono.csv", { type: "text/csv" })],
        },
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent("Читаю виписку…");

    await act(async () => {
      resolvePreview({
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
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("АТБ")).toBeInTheDocument(),
    );
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
      fireEvent.change(fileInputFor(/виписку файлом/i), {
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
      fireEvent.change(fileInputFor(/виписку файлом/i), {
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
      fireEvent.change(fileInputFor(/виписку файлом/i), {
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
      // Порожній `rows` = легасі-шлях (сервер без per-row результатів):
      // ці кейси навмисно лишаються на `getImportBatch`.
      rows: [],
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
      // Порожній `rows` = легасі-шлях (сервер без per-row результатів):
      // ці кейси навмисно лишаються на `getImportBatch`.
      rows: [],
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
      rows: [{ id: "imp1:aaa", status: "mono_matched" }],
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
