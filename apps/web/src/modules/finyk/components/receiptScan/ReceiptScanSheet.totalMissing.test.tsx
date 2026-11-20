// @vitest-environment jsdom
/**
 * Чек, на якому не видно підсумку (рішення власника 2026-11-19, спека
 * `docs/work/specs/finyk-receipt-total-not-visible.md`): сума 0 з фото не
 * стає витратою на 0 ₴. Окремий файл, бо `ReceiptScanSheet.test.tsx` уже
 * довгий; мок-обвʼязка та сама.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptDraft } from "@sergeant/api-client";

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
        analyzeReceipt: (...args: unknown[]) => analyzeReceiptMock(...args),
        saveReceipt: (...args: unknown[]) => saveReceiptMock(...args),
      },
    },
  };
});

vi.mock("../../hooks/useReceiptQrScanner", () => ({
  useReceiptQrScanner: () => ({ videoRef: { current: null }, status: "" }),
  decodeQrFromImageFile: () => Promise.resolve(null),
}));

import { safeWriteLS } from "@shared/lib/storage/storage";
import { ReceiptScanSheet } from "./ReceiptScanSheet";
import { FINYK_PHOTO_PRIVACY_ACK_KEY } from "./FinykPhotoPrivacyNotice";
import type { ReceiptSaveStorageSlice } from "../../hooks/useReceiptSave";

const HINT = "Підсумку на фото не видно, введи суму.";
const SAVE_BLOCKED = "Введи суму чека, щоб зберегти.";

function visionDraft(overrides: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-11-19T10:00:00.000Z",
    totalKopiykas: 0,
    items: [
      {
        position: 1,
        name: "Хліб",
        qty: 1,
        priceKopiykas: 3200,
        sumKopiykas: 3200,
      },
    ],
    confidence: 0.6,
    rawPayload: {},
    ...overrides,
  };
}

function savedReceipt(totalKopiykas: number) {
  return {
    alreadyExists: false,
    receipt: {
      id: 1,
      source: "vision",
      fiscalNum: null,
      store: "Сільпо",
      storeTaxId: null,
      purchasedAt: "2026-11-19T10:00:00.000Z",
      totalKopiykas,
      items: [],
      link: { txKind: "mono", txRef: "mono-tx-1" },
      createdAt: "x",
      updatedAt: "x",
    },
  };
}

beforeEach(() => {
  analyzeReceiptMock.mockReset();
  saveReceiptMock.mockReset();
  safeWriteLS(FINYK_PHOTO_PRIVACY_ACK_KEY, true);
});

function renderSheet() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReceiptScanSheet
        open
        onClose={onClose}
        storage={
          {
            manualExpenses: [],
            addManualExpense: vi.fn(),
            removeManualExpense: vi.fn(),
          } as unknown as ReceiptSaveStorageSlice
        }
        onReceiptLinked={vi.fn()}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

function selectFiles(n: number) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const files = Array.from(
    { length: n },
    (_, i) =>
      new File([new Uint8Array(10)], `r${i}.jpg`, { type: "image/jpeg" }),
  );
  fireEvent.change(input, { target: { files } });
}

describe("ReceiptScanSheet — підсумку на фото не видно (одиночний чек)", () => {
  it("збереження заблоковане з поясненням, доки сума 0; після введення суми чек зберігається", async () => {
    analyzeReceiptMock.mockResolvedValue({ draft: visionDraft() });
    const { onSaved } = renderSheet();

    await act(async () => {
      selectFiles(1);
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Сільпо")).toBeInTheDocument(),
    );

    const save = screen.getByRole("button", { name: "Зберегти" });
    expect(save).toBeDisabled();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.getByText(SAVE_BLOCKED)).toBeInTheDocument();
    fireEvent.click(save);
    expect(saveReceiptMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Сума чека"), {
      target: { value: "32" },
    });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.queryByText(SAVE_BLOCKED)).not.toBeInTheDocument();

    saveReceiptMock.mockResolvedValue(savedReceipt(3200));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(false));
    expect(saveReceiptMock.mock.calls[0]?.[0]).toMatchObject({
      totalKopiykas: 3200,
    });
  });

  it("порожня чернетка («не чек»): лишається один банер, без попередження біля суми", async () => {
    analyzeReceiptMock.mockResolvedValue({
      draft: visionDraft({ store: "", items: [], confidence: 0 }),
    });
    renderSheet();

    await act(async () => {
      selectFiles(1);
    });
    await waitFor(() =>
      expect(screen.getByText(/Схоже, на фото не чек/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });
});

describe("ReceiptScanSheet — підсумку на фото не видно (пачка)", () => {
  it("рядок із сумою 0 має бейдж «потрібна сума» і не зберігається; решта пачки зберігається", async () => {
    analyzeReceiptMock
      .mockResolvedValueOnce({ draft: visionDraft({ store: "Сільпо" }) })
      .mockResolvedValueOnce({
        draft: visionDraft({ store: "АТБ", totalKopiykas: 5000 }),
      });
    renderSheet();

    await act(async () => {
      selectFiles(2);
    });
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(2));

    expect(screen.getByText("потрібна сума")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Включити чек" })).toBeDisabled();

    saveReceiptMock.mockResolvedValue(savedReceipt(5000));
    fireEvent.click(
      screen.getByRole("button", { name: "Зберегти вибрані (1)" }),
    );

    await waitFor(() => expect(saveReceiptMock).toHaveBeenCalledTimes(1));
    expect(saveReceiptMock.mock.calls[0]?.[0]).toMatchObject({ store: "АТБ" });
  });

  it("введена в повному review сума повертає рядок у вибрані", async () => {
    analyzeReceiptMock
      .mockResolvedValueOnce({ draft: visionDraft({ store: "Сільпо" }) })
      .mockResolvedValueOnce({
        draft: visionDraft({ store: "АТБ", totalKopiykas: 5000 }),
      });
    renderSheet();

    await act(async () => {
      selectFiles(2);
    });
    await waitFor(() => expect(analyzeReceiptMock).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (1)" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Редагувати" })[0] as HTMLElement,
    );
    expect(screen.getByText(HINT)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Сума чека"), {
      target: { value: "32" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.queryByText("потрібна сума")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (2)" }),
    ).toBeInTheDocument();
  });
});
