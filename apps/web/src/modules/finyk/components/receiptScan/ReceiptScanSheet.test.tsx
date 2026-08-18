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
  it("renders both entry actions", () => {
    renderSheet();
    expect(
      screen.getByRole("button", { name: /Скан QR камерою/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Завантажити фото/ }),
    ).toBeInTheDocument();
  });
});

describe("ReceiptScanSheet — camera QR path", () => {
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
            "Чек ще не з'явився в реєстрі ДПС — спробуй за кілька хвилин або сфотографуй чек.",
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
        screen.getByText(/ще не з'явився в реєстрі ДПС/),
      ).toBeInTheDocument(),
    );
  });
});

describe("ReceiptScanSheet — photo upload path", () => {
  function selectPhoto(file: File) {
    fireEvent.click(screen.getByRole("button", { name: /Завантажити фото/ }));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("uses the QR-in-photo lookup path when zxing finds a DPS QR in the image", async () => {
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

describe("ReceiptScanSheet — save (alreadyExists handling)", () => {
  async function openReview() {
    lookupReceiptMock.mockResolvedValue({ draft: draft() });
    const helpers = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /Скан QR камерою/ }));
    await act(async () => {
      onDetectedRef.current?.(DPS_URL);
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
