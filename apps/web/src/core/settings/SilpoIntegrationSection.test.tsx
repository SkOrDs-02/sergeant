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
      updateSettings: vi.fn(),
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
const mockedUpdateSettings = silpoApi.updateSettings as unknown as ReturnType<
  typeof vi.fn
>;

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

  // Дві перевірки нижче — про те, чого бракувало два тижні: зламаний синк
  // виглядав рівно як «людина не ходила в магазин». Обидві сторони важать
  // однаково: без першої поломку не видно, без другої плашка висіла б і
  // після того, як усе полагодилось, і сигнал знецінився б.
  it("показує плашку, коли останній синк провалився", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-09-20T10:00:00.000Z",
      lastSyncAt: "2026-08-31T09:15:00.000Z",
      lastFailedAt: "2026-09-14T08:00:00.000Z",
      lastErrorCode: "SILPO_TOOL_ERROR",
      receiptsCount: 12,
    });

    renderSection();

    expect(await screen.findByText("Чеки не оновлюються")).toBeInTheDocument();
    expect(screen.getByText(/SILPO_TOOL_ERROR/)).toBeInTheDocument();
    // Копія називає дію, а не лише факт (style-guide: помилка закривається
    // підказкою до дії).
    expect(screen.getByText(/Натисни «Оновити чеки»/)).toBeInTheDocument();
  });

  it("не показує плашку, коли провалів немає", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-09-20T10:00:00.000Z",
      lastSyncAt: "2026-09-14T09:15:00.000Z",
      lastFailedAt: null,
      lastErrorCode: null,
      receiptsCount: 12,
    });

    renderSection();

    expect(await screen.findByText("Сільпо звʼязано")).toBeInTheDocument();
    expect(screen.queryByText("Чеки не оновлюються")).not.toBeInTheDocument();
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
      await screen.findByText("Сільпо просить увійти ще раз"),
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
    expect(dialog.textContent).toContain("Підтверджені розбиття категорій");
    expect(dialog.textContent).toContain("НЕ видаляються");

    // Wipe must not fire before the user confirms.
    expect(mockedWipe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Видалити назавжди" }));

    await vi.waitFor(() => expect(mockedWipe).toHaveBeenCalledTimes(1));
  });

  it("тумблер автоімпорту показує стан із pantryAutoImportSince і вмикає його PUT-ом", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-17T09:15:00.000Z",
      receiptsCount: 5,
      pantryAutoImportSince: null,
    });
    mockedUpdateSettings.mockResolvedValue({
      pantryAutoImportSince: "2026-09-29T10:00:00.000Z",
    });

    renderSection();

    const toggle = await screen.findByRole("switch", {
      name: "Додавати продукти з чеків у комору автоматично",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await vi.waitFor(() =>
      expect(mockedUpdateSettings).toHaveBeenCalledWith({
        pantryAutoImport: true,
      }),
    );
  });

  describe("тумблер автоімпорту: причина відмови в тості", () => {
    const TOGGLE_NAME = "Додавати продукти з чеків у комору автоматично";

    async function clickToggleExpectingFailure(error: unknown) {
      mockedSyncState.mockResolvedValue({
        status: "connected",
        accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
        lastSyncAt: "2026-08-17T09:15:00.000Z",
        receiptsCount: 5,
        pantryAutoImportSince: null,
      });
      mockedUpdateSettings.mockRejectedValue(error);
      renderSection();
      fireEvent.click(await screen.findByRole("switch", { name: TOGGLE_NAME }));
      await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
      return toastMock.error.mock.calls[0] as [
        string,
        undefined,
        { label: string; onClick: () => void },
      ];
    }

    function httpError(status: number, body?: unknown) {
      return new ApiError({
        kind: "http",
        message: `HTTP ${status}`,
        status,
        body,
        url: "/api/silpo/settings",
      });
    }

    it("404 (бекенд старіший за веб) каже, що сервер ще не оновлено, а не загальне «не вдалося»", async () => {
      const [message, , action] = await clickToggleExpectingFailure(
        httpError(404),
      );
      expect(message).toContain("Сервер ще не оновлено");
      expect(message).not.toBe("Не вдалося змінити налаштування.");
      expect(action.label).toBe("Повторити");
    });

    it("текст сервера віддається як є", async () => {
      const [message] = await clickToggleExpectingFailure(
        httpError(409, { error: "Спершу звʼяжи акаунт Сільпо." }),
      );
      expect(message).toBe("Спершу звʼяжи акаунт Сільпо.");
    });

    it("шлюзовий збій дає дію, а не голий номер", async () => {
      const [message] = await clickToggleExpectingFailure(httpError(503));
      expect(message).toBe("Сервер тимчасово не відповідає. Спробуй ще раз.");
    });

    it("500 без тексту сервера показує код статусу", async () => {
      const [message] = await clickToggleExpectingFailure(httpError(500));
      expect(message).toContain("Не вдалося змінити налаштування.");
      expect(message).toContain("500");
    });

    it("збій мережі відрізняється від збою сервера", async () => {
      const [message] = await clickToggleExpectingFailure(
        new ApiError({
          kind: "network",
          message: "Failed to fetch",
          url: "/api/silpo/settings",
        }),
      );
      expect(message).toContain("зʼєднатися із сервером");
      expect(message).not.toContain("Failed to fetch");
    });

    it("не-API помилка (наприклад, ZodError) не світить технічний message", async () => {
      const [message] = await clickToggleExpectingFailure(
        new Error('[{"code":"invalid_type","path":["pantryAutoImportSince"]}]'),
      );
      expect(message).toBe("Не вдалося змінити налаштування.");
    });

    it("«Повторити» повторює той самий PUT", async () => {
      const [, , action] = await clickToggleExpectingFailure(httpError(404));
      mockedUpdateSettings.mockClear();
      mockedUpdateSettings.mockResolvedValue({
        pantryAutoImportSince: "2026-10-01T10:00:00.000Z",
      });
      action.onClick();
      await vi.waitFor(() =>
        expect(mockedUpdateSettings).toHaveBeenCalledWith({
          pantryAutoImport: true,
        }),
      );
    });
  });
});
