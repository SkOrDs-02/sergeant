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
import { ApiError } from "@shared/api";
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
const onDetectedRef: { current: ((raw: string) => void) | null } = {
  current: null,
};
vi.mock("../../hooks/useReceiptQrScanner", () => ({
  useReceiptQrScanner: ({
    onDetected,
  }: {
    onDetected: (raw: string) => void;
    active: boolean;
  }) => {
    onDetectedRef.current = onDetected;
    return { videoRef: { current: null }, status: "" };
  },
  decodeQrFromImageFile: (...args: unknown[]) =>
    decodeQrFromImageFileMock(...args),
}));

import { ReceiptScanSheet } from "./ReceiptScanSheet";
import { DPS_QR_SCAN_ENABLED } from "./dpsQrGate";
import type { ReceiptSaveStorageSlice } from "../../hooks/useReceiptSave";

function draft(overrides: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    source: "dps",
    fiscalNum: "4000123456",
    store: "АТБ",
    storeTaxId: "12345678",
    purchasedAt: "2026-08-17T10:00:00.000Z",
    totalKopiykas: 5000,
    items: [],
    confidence: null,
    rawPayload: {},
    ...overrides,
  };
}

function makeStorage(): ReceiptSaveStorageSlice & {
  addManualExpense: ReturnType<typeof vi.fn>;
} {
  return {
    manualExpenses: [],
    addManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
  } as ReceiptSaveStorageSlice & { addManualExpense: ReturnType<typeof vi.fn> };
}

const DPS_URL =
  "https://cabinet.tax.gov.ua/cashregs/check?id=1&date=17082026&time=1000&fn=4000123456&sm=5000";

beforeEach(() => {
  lookupReceiptMock.mockReset();
  analyzeReceiptMock.mockReset();
  saveReceiptMock.mockReset();
  decodeQrFromImageFileMock.mockReset();
  onDetectedRef.current = null;
});

function renderSheet(
  overrides: Partial<Parameters<typeof ReceiptScanSheet>[0]> = {},
) {
  const storage = makeStorage();
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onReceiptLinked = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReceiptScanSheet
        open
        onClose={onClose}
        storage={storage}
        onReceiptLinked={onReceiptLinked}
        onSaved={onSaved}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { storage, onClose, onSaved, onReceiptLinked };
}

describe("ReceiptScanSheet — choose stage", () => {
  it("рендерить фото-кнопку; QR-кнопка лише коли ДПС-гейт увімкнено", () => {
    renderSheet();
    expect(
      screen.getByRole("button", { name: /Завантажити фото/ }),
    ).toBeInTheDocument();
    // Гейт `dpsQrGate.ts`: поки реєстр ДПС закритий на воєнний стан,
    // QR-кнопки НЕМАЄ (бета-фідбек 2026-08-18); фліп гейта поверне її і
    // оживить skipIf-тести нижче.
    const qrButton = screen.queryByRole("button", { name: /Скан QR камерою/ });
    if (DPS_QR_SCAN_ENABLED) {
      expect(qrButton).toBeInTheDocument();
    } else {
      expect(qrButton).not.toBeInTheDocument();
    }
  });
});

describe.skipIf(!DPS_QR_SCAN_ENABLED)(
  "ReceiptScanSheet — camera QR path",
  () => {
    it("a valid DPS QR triggers lookup and opens the review screen", async () => {
      lookupReceiptMock.mockResolvedValue({ draft: draft() });
      renderSheet();

      fireEvent.click(screen.getByRole("button", { name: /Скан QR камерою/ }));
      await act(async () => {
        onDetectedRef.current?.(DPS_URL);
      });

      await waitFor(() =>
        expect(screen.getByDisplayValue("АТБ")).toBeInTheDocument(),
      );
      expect(lookupReceiptMock).toHaveBeenCalledWith({
        fn: "4000123456",
        id: "1",
        date: "17082026",
        time: "1000",
        sm: "5000",
      });
    });

    it("an unrelated QR shows an inline error and stays on the camera stage", async () => {
      renderSheet();
      fireEvent.click(screen.getByRole("button", { name: /Скан QR камерою/ }));
      await act(async () => {
        onDetectedRef.current?.("https://example.com/not-a-receipt");
      });

      expect(lookupReceiptMock).not.toHaveBeenCalled();
      expect(screen.getByText(/не схожий на чек ДПС/)).toBeInTheDocument();
    });

    it("surfaces the server's human message when the DPS lookup fails (e.g. not found)", async () => {
      lookupReceiptMock.mockRejectedValue(
        new ApiError({
          kind: "http",
          status: 404,
          message: "HTTP 404",
          url: "https://api.test/finyk/receipts/lookup",
          body: {
            error:
              "Чек ще не зʼявився в реєстрі ДПС, спробуй за кілька хвилин або сфотографуй чек.",
          },
        }),
      );
      renderSheet();
      fireEvent.click(screen.getByRole("button", { name: /Скан QR камерою/ }));
      await act(async () => {
        onDetectedRef.current?.(DPS_URL);
      });

      await waitFor(() =>
        expect(
          screen.getByText(/ще не зʼявився в реєстрі ДПС/),
        ).toBeInTheDocument(),
      );
    });
  },
);

describe("ReceiptScanSheet — photo upload path", () => {
  function selectPhoto(file: File) {
    fireEvent.click(screen.getByRole("button", { name: /Завантажити фото/ }));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it.skipIf(!DPS_QR_SCAN_ENABLED)(
    "uses the QR-in-photo lookup path when zxing finds a DPS QR in the image",
    async () => {
      decodeQrFromImageFileMock.mockResolvedValue(DPS_URL);
      lookupReceiptMock.mockResolvedValue({ draft: draft() });
      renderSheet();

      await act(async () => {
        selectPhoto(
          new File([new Uint8Array(10)], "chek.jpg", { type: "image/jpeg" }),
        );
      });

      await waitFor(() => expect(lookupReceiptMock).toHaveBeenCalled());
      expect(analyzeReceiptMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByDisplayValue("АТБ")).toBeInTheDocument(),
      );
    },
  );

  it.skipIf(DPS_QR_SCAN_ENABLED)(
    "з вимкненим ДПС-гейтом фото йде ОДРАЗУ у vision — QR-декод навіть не викликається",
    async () => {
      analyzeReceiptMock.mockResolvedValue({
        draft: draft({ source: "vision", fiscalNum: null, store: "Сільпо" }),
      });
      renderSheet();

      await act(async () => {
        selectPhoto(
          new File([new Uint8Array(10)], "chek.jpg", { type: "image/jpeg" }),
        );
      });

      await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalled());
      expect(decodeQrFromImageFileMock).not.toHaveBeenCalled();
      expect(lookupReceiptMock).not.toHaveBeenCalled();
    },
  );

  it("показує «Розпізнаю чек…», поки vision у польоті", async () => {
    // Бета-фідбек №5 (2026-08-18): статус має називати ФАЗУ, а не стояти
    // одним рядком усі 20 секунд — інакше екран читається як завислий.
    decodeQrFromImageFileMock.mockResolvedValue(null);
    let resolveAnalyze: (value: unknown) => void = () => {};
    analyzeReceiptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnalyze = resolve;
        }),
    );
    renderSheet();

    await act(async () => {
      selectPhoto(
        new File([new Uint8Array(10)], "chek.jpg", { type: "image/jpeg" }),
      );
    });

    // Стиснення фото — теж очікування, і воно починається до мережі.
    expect(screen.getByRole("status")).toHaveTextContent("Готую фото…");

    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("Розпізнаю чек…");

    await act(async () => {
      resolveAnalyze({
        draft: draft({ source: "vision", fiscalNum: null, store: "Сільпо" }),
      });
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("Сільпо")).toBeInTheDocument(),
    );
  });

  it("порожній vision-драфт (фото не чека) показує чесний банер над формою", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({
        source: "vision",
        fiscalNum: null,
        store: "",
        totalKopiykas: 0,
        items: [],
        confidence: 0,
      }),
    });
    renderSheet();

    await act(async () => {
      selectPhoto(
        new File([new Uint8Array(10)], "kavun.jpg", { type: "image/jpeg" }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText(/на фото не чек/)).toBeInTheDocument(),
    );
  });

  it("falls back to vision analyze when no QR is found in the photo, and shows the confidence badge", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({
        source: "vision",
        fiscalNum: null,
        confidence: 0.8,
        store: "Сільпо",
      }),
    });
    renderSheet();

    await act(async () => {
      selectPhoto(
        new File([new Uint8Array(10)], "chek.jpg", { type: "image/jpeg" }),
      );
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("Сільпо")).toBeInTheDocument(),
    );
    expect(screen.getByText(/розпізнано з фото/)).toBeInTheDocument();
  });

  it("shows the TOO_LARGE guard message for a 413 image-validation error from analyze", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 413,
        message: "HTTP 413",
        url: "https://api.test/finyk/receipts/analyze",
        body: { code: "TOO_LARGE", detail: "too big" },
      }),
    );
    renderSheet();

    await act(async () => {
      selectPhoto(
        new File([new Uint8Array(10)], "chek.jpg", { type: "image/jpeg" }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText(/Фото завелике/)).toBeInTheDocument(),
    );
  });
});

describe("ReceiptScanSheet — чеки пачкою (multiple-пікер)", () => {
  // Батч переїхав сюди з BulkImportSheet (бета-фідбек №2, 2026-08-18):
  // 1 файл → одиничний review-флоу, 2+ → стадія `batch` з
  // BulkReceiptsProgress; кап 10 фото — у `useBulkReceiptsImport`.
  function nFiles(n: number): File[] {
    return Array.from(
      { length: n },
      (_, i) =>
        new File([new Uint8Array(10)], `r${i}.jpg`, { type: "image/jpeg" }),
    );
  }

  function selectFiles(files: File[]) {
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files } });
  }

  it("2 фото відкривають стадію «Чеки пачкою» з обома рядками, без кап-примітки", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({ source: "vision", fiscalNum: null, store: "Сільпо" }),
    });
    renderSheet();

    await act(async () => {
      selectFiles(nFiles(2));
    });

    expect(screen.getByText("Чеки пачкою")).toBeInTheDocument();
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Взято перші/)).not.toBeInTheDocument();
    if (!DPS_QR_SCAN_ENABLED) {
      // Гейт діє і в батчі: жодної спроби QR-декоду на файл.
      expect(decodeQrFromImageFileMock).not.toHaveBeenCalled();
    }
  });

  it("вибір понад 10 фото показує примітку і реально обробляє РІВНО 10", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({ source: "vision", fiscalNum: null, store: "" }),
    });
    renderSheet();

    await act(async () => {
      selectFiles(nFiles(11));
    });

    expect(screen.getByText(/Взято перші 10 фото з 11/)).toBeInTheDocument();
    // 11-й файл (r10.jpg) НЕ обробляється: analyze викликано рівно 10
    // разів (slice у startFiles), рядок прогресу для нього не рендериться.
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(10));
    expect(screen.queryByText("r10.jpg")).not.toBeInTheDocument();
  });

  it("порожні драфти позначаються «схоже, не чек» і авто-виключаються зі збереження", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({
        source: "vision",
        fiscalNum: null,
        store: "",
        totalKopiykas: 0,
        items: [],
        confidence: 0,
      }),
    });
    renderSheet();

    await act(async () => {
      selectFiles(nFiles(2));
    });
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(2));

    // Бета-фідбек №3: у батчі той самий «чесний фідбек», що в одиночному
    // флоу — бейдж на рядку + нуль у «Зберегти вибрані».
    expect(screen.getAllByText("схоже, не чек")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (0)" }),
    ).toBeInTheDocument();
  });

  it("«Редагувати» відкриває повний review чека, правки лягають у рядок, «Готово» повертає в список", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({ source: "vision", fiscalNum: null, store: "Сільпо" }),
    });
    renderSheet();

    await act(async () => {
      selectFiles(nFiles(2));
    });
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(2));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Редагувати" })[0] as HTMLElement,
    );
    // Повний review-екран того самого `ReceiptReviewForm`, що і в
    // одиночному флоу: поле «Магазин» доступне і редаговане.
    expect(screen.getByLabelText("Магазин")).toHaveValue("Сільпо");
    fireEvent.change(screen.getByLabelText("Магазин"), {
      target: { value: "АТБ" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    // Назад у список: перший рядок перейменований, другий незмінний,
    // обидва досі вибрані.
    expect(screen.getByText("АТБ")).toBeInTheDocument();
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (2)" }),
    ).toBeInTheDocument();
  });

  it("заповнення полів у review порожнього чека повертає його у вибрані", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({
        source: "vision",
        fiscalNum: null,
        store: "",
        totalKopiykas: 0,
        items: [],
        confidence: 0,
      }),
    });
    renderSheet();

    await act(async () => {
      selectFiles(nFiles(2));
    });
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (0)" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Редагувати" })[0] as HTMLElement,
    );
    fireEvent.change(screen.getByLabelText("Магазин"), {
      target: { value: "Кіоск" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    // Авто-повернення у вибрані (`updateItemDraft`): заповнені поля =
    // людина підтвердила, що це таки чек.
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (1)" }),
    ).toBeInTheDocument();
  });

  it("примітка про кап зникає після закриття і повторного відкриття шита", async () => {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({
      draft: draft({ source: "vision", fiscalNum: null, store: "" }),
    });
    const storage = makeStorage();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const sheet = (open: boolean) => (
      <QueryClientProvider client={client}>
        <ReceiptScanSheet
          open={open}
          onClose={vi.fn()}
          storage={storage}
          onReceiptLinked={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(sheet(true));

    await act(async () => {
      selectFiles(nFiles(11));
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

describe("ReceiptScanSheet — save (alreadyExists handling)", () => {
  // Через фото+vision, а не камеру: QR-шлях за гейтом (`dpsQrGate.ts`)
  // недосяжний, а save-механіка від входу не залежить.
  async function openReview() {
    decodeQrFromImageFileMock.mockResolvedValue(null);
    analyzeReceiptMock.mockResolvedValue({ draft: draft() });
    const helpers = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /Завантажити фото/ }));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            new File([new Uint8Array(10)], "chek.jpg", { type: "image/jpeg" }),
          ],
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("АТБ")).toBeInTheDocument(),
    );
    return helpers;
  }

  it("onSaved(false) + onClose when the receipt is newly created", async () => {
    const { onSaved, onClose } = await openReview();
    saveReceiptMock.mockResolvedValue({
      alreadyExists: false,
      receipt: {
        id: 1,
        source: "dps",
        fiscalNum: "4000123456",
        store: "АТБ",
        storeTaxId: "12345678",
        purchasedAt: "2026-08-17T10:00:00.000Z",
        totalKopiykas: 5000,
        items: [],
        link: { txKind: "mono", txRef: "mono-tx-1" },
        createdAt: "x",
        updatedAt: "x",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(false));
    expect(onClose).toHaveBeenCalled();
  });

  it("onSaved(true) + onClose when the receipt already existed (idempotent replay)", async () => {
    const { onSaved, onClose } = await openReview();
    saveReceiptMock.mockResolvedValue({
      alreadyExists: true,
      receipt: {
        id: 1,
        source: "dps",
        fiscalNum: "4000123456",
        store: "АТБ",
        storeTaxId: "12345678",
        purchasedAt: "2026-08-17T10:00:00.000Z",
        totalKopiykas: 5000,
        items: [],
        link: { txKind: "mono", txRef: "mono-tx-1" },
        createdAt: "x",
        updatedAt: "x",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(true));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the sheet open and shows the error when save fails", async () => {
    const { onSaved, onClose } = await openReview();
    saveReceiptMock.mockRejectedValue(new Error("network down"));

    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() =>
      expect(screen.getByText("network down")).toBeInTheDocument(),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
