// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
    silpoConnectUrl: () => "https://example.test/api/v1/silpo/connect",
  };
});

const toastMock = {
  show: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  dismiss: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
};
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => toastMock,
}));

import { silpoApi } from "@shared/api";
import { SilpoIntegrationSection } from "./SilpoIntegrationSection";
import { ApiError } from "@sergeant/api-client";

const mockedSyncState = silpoApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedWipe = silpoApi.wipe as unknown as ReturnType<typeof vi.fn>;
const mockedReceipts = silpoApi.receipts as unknown as ReturnType<typeof vi.fn>;

function renderSection(addManualExpense = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SilpoIntegrationSection inView addManualExpense={addManualExpense} />
    </QueryClientProvider>,
  );
}

describe("SilpoIntegrationSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // "Чеки без транзакції" (track B) fetches `silpoApi.receipts` whenever
    // status is "connected" — default to an empty page so the existing
    // track-A assertions below aren't coupled to the unmatched-receipts
    // feature. Tests that care about it override this per-case.
    mockedReceipts.mockResolvedValue({ data: [], nextCursor: null });
  });
  afterEach(cleanup);

  it("shows the quiet 'not enabled' card on 503 SILPO_DISABLED", async () => {
    mockedSyncState.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "disabled",
        status: 503,
        body: { code: "SILPO_DISABLED" },
        url: "/api/silpo/sync-state",
      }),
    );

    renderSection();

    expect(
      await screen.findByText("Інтеграція ще не увімкнена"),
    ).toBeInTheDocument();
    // No connect CTA, no danger section — the card degrades quietly.
    expect(screen.queryByText("Звʼязати Сільпо")).not.toBeInTheDocument();
  });

  it("shows the connect CTA when disconnected", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 0,
    });

    renderSection();

    expect(await screen.findByText("Звʼязати Сільпо")).toBeInTheDocument();
    // No leftover receipts — no single point of deletion needed.
    expect(
      screen.queryByText("Видалити всі дані Сільпо"),
    ).not.toBeInTheDocument();
  });

  it("shows the privacy-promise text before the connect CTA when disconnected (gate #2)", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 0,
    });

    renderSection();

    // Дослівний затверджений текст (§ Відкриті гейти, гейт №2) —
    // видимий одразу, не за "показати більше".
    expect(
      await screen.findByText(
        /Чеки з Сільпо зберігаються у твоїй базі Sergeant/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Назви куплених товарів ніколи не потрапляють/),
    ).toBeInTheDocument();
    // Обіцянка стоїть ПЕРЕД кнопкою рішення, не після — саме над "Звʼязати
    // Сільпо" в DOM-порядку картки (не окремий `<details>`, як у
    // connected-стані).
    expect(
      screen.queryByText("Що відбувається з даними чеків"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Звʼязати Сільпо")).toBeInTheDocument();
  });

  it("keeps the wipe action reachable after disconnect when receipts remain", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: "2026-08-10T09:15:00.000Z",
      receiptsCount: 3,
    });

    renderSection();

    expect(await screen.findByText("Звʼязати Сільпо")).toBeInTheDocument();
    // `findByText` (not `getByText`) — the danger group only appears once
    // `syncState.receiptsCount` has actually loaded, not at the initial
    // "unknown" pre-fetch render (which also shows the connect CTA).
    expect(
      await screen.findByText("Видалити всі дані Сільпо"),
    ).toBeInTheDocument();
  });

  it("shows connected status with receipt count and last sync", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:15:00.000Z",
      receiptsCount: 5,
    });

    renderSection();

    expect(await screen.findByText("Сільпо звʼязано")).toBeInTheDocument();
    expect(screen.getByText(/5 чеків/)).toBeInTheDocument();
    expect(screen.getByText("Оновити чеки")).toBeInTheDocument();
    expect(screen.getByText("Видалити всі дані Сільпо")).toBeInTheDocument();
  });

  it("keeps the privacy-promise text reachable via a collapsed details when connected (gate #2)", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:15:00.000Z",
      receiptsCount: 5,
    });

    renderSection();

    expect(await screen.findByText("Сільпо звʼязано")).toBeInTheDocument();
    const summary = screen.getByText("Що відбувається з даними чеків");
    expect(summary.closest("details")).not.toBeNull();
    expect(summary.closest("details")).not.toHaveAttribute("open");
    // Той самий i18n-текст, що в disconnected-стані — не дубль рядка.
    expect(
      screen.getByText(/Чеки з Сільпо зберігаються у твоїй базі Sergeant/),
    ).toBeInTheDocument();
  });

  it("shows the reauth banner and reconnect CTA when reauth_required", async () => {
    mockedSyncState.mockResolvedValue({
      status: "reauth_required",
      accessTokenExpiresAt: null,
      lastSyncAt: "2026-08-10T09:15:00.000Z",
      receiptsCount: 3,
    });

    renderSection();

    expect(
      await screen.findByText("Сільпо просить повторну авторизацію"),
    ).toBeInTheDocument();
    expect(screen.getByText("Підключити повторно")).toBeInTheDocument();
  });

  it("wipe requires explicit confirm and calls silpoApi.wipe on confirmation", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:15:00.000Z",
      receiptsCount: 5,
    });
    mockedWipe.mockResolvedValue({ ok: true, deletedReceipts: 5 });

    renderSection();

    fireEvent.click(await screen.findByText("Видалити всі дані Сільпо"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Видалити всі дані Сільпо?");
    // Explicit wording: splits/pantry survive, only Silpo-owned rows go.
    expect(dialog.textContent).toContain("Підтверджені спліти категорій");
    expect(dialog.textContent).toContain("НЕ видаляються");

    // Wipe must not fire before the user confirms.
    expect(mockedWipe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Видалити назавжди" }));

    await vi.waitFor(() => expect(mockedWipe).toHaveBeenCalledTimes(1));
  });
});
