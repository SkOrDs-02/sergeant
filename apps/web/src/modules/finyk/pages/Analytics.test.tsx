// @vitest-environment jsdom
/**
 * Coverage tests for the Analytics page.
 *
 * Analytics receives `mono` + `storage` adapters as props, so we drive it with
 * plain stubs — no providers needed. We mock the lazy CategoryPieChart so the
 * Suspense boundary resolves synchronously, and verify: initial render,
 * month navigation (prev/next + disabled next on current month), prior-month
 * fetch + comparison section, fetch-error + retry, manual-expense merge, and
 * the empty-state branches.
 *
 * Money is integer kopiykas (number); time pinned to Europe/Kyiv.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { Analytics } from "./Analytics";
import type {
  AnalyticsMonoAdapter,
  AnalyticsStorageAdapter,
} from "./Analytics";

// Mock the lazy chart so Suspense resolves immediately and we don't pull recharts.
vi.mock("../components/charts/lazy", () => ({
  CategoryPieChart: ({ total }: { total?: number }) => (
    <div data-testid="pie">pie total {total}</div>
  ),
}));

const KYIV = new Date("2026-06-15T09:00:00Z"); // mid-June 2026, Kyiv-local

function mkTx(id: string, amount: number, time: number): Transaction {
  return {
    id,
    amount,
    time,
    description: id === "merch" ? "Сільпо" : "tx",
    mcc: 5411,
    categoryId: "food",
  } as unknown as Transaction;
}

function buildMono(
  overrides: Partial<AnalyticsMonoAdapter> = {},
): AnalyticsMonoAdapter {
  return {
    realTx: [],
    loadingTx: false,
    fetchMonth: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function buildStorage(
  overrides: Partial<AnalyticsStorageAdapter> = {},
): AnalyticsStorageAdapter {
  return {
    excludedTxIds: new Set<string>(),
    txSplits: {},
    manualExpenses: [],
    ...overrides,
  };
}

describe("Analytics page", () => {
  beforeEach(() => {
    // shouldAdvanceTime lets RTL's waitFor/findBy polling (real-timer based)
    // proceed while the system clock stays pinned to mid-June 2026 (Kyiv).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(KYIV);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the section headings and current month", async () => {
    await act(async () => {
      render(<Analytics mono={buildMono()} storage={buildStorage()} />);
    });
    expect(screen.getByText("Підсумок місяця")).toBeInTheDocument();
    expect(screen.getByText("Категорії")).toBeInTheDocument();
    expect(screen.getByText("Топ продавці")).toBeInTheDocument();
    // empty-state copy for no data
    expect(screen.getByText("Поки немає витрат")).toBeInTheDocument();
    expect(screen.getByText("Поки немає продавців")).toBeInTheDocument();
  });

  it("disables the next-month button while on the current month", async () => {
    await act(async () => {
      render(<Analytics mono={buildMono()} storage={buildStorage()} />);
    });
    expect(screen.getByLabelText("Наступний місяць")).toBeDisabled();
  });

  it("navigates to the previous month and fetches it from the server", async () => {
    const fetchMonth = vi.fn().mockResolvedValue([]);
    await act(async () => {
      render(
        <Analytics mono={buildMono({ fetchMonth })} storage={buildStorage()} />,
      );
    });
    // mount fires prev-month fetch already (for May); navigate to May
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Попередній місяць"));
    });
    // now on May → next becomes enabled
    expect(screen.getByLabelText("Наступний місяць")).not.toBeDisabled();
    // fetchMonth was called for the prior-month comparison and/or selected month
    expect(fetchMonth).toHaveBeenCalled();
  });

  it("navigates back to the next month", async () => {
    await act(async () => {
      render(<Analytics mono={buildMono()} storage={buildStorage()} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Попередній місяць"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Наступний місяць"));
    });
    // back to current month — next disabled again
    expect(screen.getByLabelText("Наступний місяць")).toBeDisabled();
  });

  it("renders the pie chart when there is category distribution", async () => {
    const now = Math.floor(KYIV.getTime() / 1000);
    const realTx = [mkTx("a", -10000, now), mkTx("b", -5000, now)];
    await act(async () => {
      render(
        <Analytics mono={buildMono({ realTx })} storage={buildStorage()} />,
      );
    });
    expect(await screen.findByTestId("pie")).toBeInTheDocument();
  });

  it("renders skeleton placeholders while current-month transactions load", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <Analytics
          mono={buildMono({ loadingTx: true })}
          storage={buildStorage()}
        />,
      ));
    });

    expect(screen.queryByText("Поки немає витрат")).toBeNull();
    expect(screen.queryByText("Поки немає продавців")).toBeNull();
    expect(
      container.querySelectorAll('[class*="animate-pulse"]').length,
    ).toBeGreaterThanOrEqual(7);
  });

  it("shows a fetch error and retries on click", async () => {
    const fetchMonth = vi
      .fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValue([]);
    await act(async () => {
      render(
        <Analytics mono={buildMono({ fetchMonth })} storage={buildStorage()} />,
      );
    });
    // Mount fires the prior-month fetch which rejects → error banner shows
    // (activeTx is empty on the current month with no realTx).
    await waitFor(() => {
      expect(
        screen.getByText("Не вдалось завантажити транзакції"),
      ).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Повторити"));
    });
    // retry clears the error banner
    await waitFor(() => {
      expect(
        screen.queryByText("Не вдалось завантажити транзакції"),
      ).not.toBeInTheDocument();
    });
  });

  it("merges manual expenses for the selected month", async () => {
    const manualExpenses = [
      {
        id: "m1",
        amount: 200,
        date: "2026-06-10",
        description: "manual",
        category: "food",
      },
    ];
    await act(async () => {
      render(
        <Analytics
          mono={buildMono()}
          storage={buildStorage({
            manualExpenses: manualExpenses as unknown as NonNullable<
              AnalyticsStorageAdapter["manualExpenses"]
            >,
          })}
        />,
      );
    });
    // manual expense produces category distribution → pie renders
    expect(await screen.findByTestId("pie")).toBeInTheDocument();
  });

  it("renders the comparison section when a prior month has data", async () => {
    const now = Math.floor(KYIV.getTime() / 1000);
    // May 2026 timestamp (prev month)
    const mayTs = Math.floor(new Date("2026-05-10T09:00:00Z").getTime() / 1000);
    const fetchMonth = vi.fn().mockResolvedValue([mkTx("prev", -30000, mayTs)]);
    await act(async () => {
      render(
        <Analytics
          mono={buildMono({ realTx: [mkTx("cur", -10000, now)], fetchMonth })}
          storage={buildStorage()}
        />,
      );
    });
    await waitFor(() => {
      expect(
        screen.getByText("Порівняння з попереднім місяцем"),
      ).toBeInTheDocument();
    });
  });
});
