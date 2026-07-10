// @vitest-environment jsdom
/**
 * Branch coverage for Overview page — loading skeleton, sync badge, insight banner,
 * balance masking, and background refresh message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { Overview } from "./Overview";
import type { useStorage } from "../hooks/useStorage";
import type { useUnifiedFinanceData } from "../hooks/useUnifiedFinanceData";

const KYIV = new Date("2026-06-15T09:00:00Z");

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

function Providers({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mkTx(id: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Math.floor(KYIV.getTime() / 1000),
    description: "test",
    mcc: 5411,
    categoryId: "food",
  } as unknown as Transaction;
}

function buildMono(overrides: Partial<MergedMonoLike> = {}): MergedMonoLike {
  return {
    realTx: [],
    loadingTx: false,
    clientInfo: null,
    accounts: [],
    transactions: [],
    syncState: { status: "idle" },
    lastUpdated: null,
    error: null,
    refresh: vi.fn(),
    privatTotal: 0,
    ...overrides,
  } as MergedMonoLike;
}

function buildStorage(overrides: Partial<StorageLike> = {}): StorageLike {
  return {
    budgets: [],
    subscriptions: [],
    dismissedRecurring: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    excludedTxIds: new Set<string>(),
    monthlyPlan: null,
    networthHistory: [],
    saveNetworthSnapshot: vi.fn(),
    txCategories: {},
    txSplits: {},
    manualAssets: [],
    customCategories: [],
    manualExpenses: [],
    ...overrides,
  } as StorageLike;
}

function renderOverview(
  props: Partial<{
    mono: MergedMonoLike;
    storage: StorageLike;
    showBalance: boolean;
    onNavigate: (page: string) => void;
  }> = {},
) {
  const overviewProps = {
    mono: buildMono(props.mono),
    storage: buildStorage(props.storage),
    showBalance: props.showBalance ?? true,
    ...(props.onNavigate ? { onNavigate: props.onNavigate } : {}),
  };
  return render(
    <Providers>
      <Overview {...overviewProps} />
    </Providers>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(KYIV);
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Overview page (branches)", () => {
  it("shows loading skeleton when loading with no cached transactions", () => {
    renderOverview({
      mono: buildMono({ loadingTx: true, realTx: [] }),
    });
    expect(screen.queryByText("Нетворс")).toBeNull();
  });

  it("renders hero content when transactions are available", () => {
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -5000)] }),
    });
    expect(screen.getByText("Нетворс")).toBeInTheDocument();
  });

  it("shows SyncStatusBadge when mono reports an error", () => {
    renderOverview({
      mono: buildMono({
        realTx: [mkTx("t1", -1000)],
        error: "sync failed",
      }),
    });
    expect(screen.getByText("sync failed")).toBeInTheDocument();
  });

  it("shows first-insight banner when unseen and data exists", () => {
    localStorage.removeItem("finyk_first_insight_seen_v1");
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -2500)] }),
    });
    expect(screen.getByText("Ось куди йдуть твої гроші")).toBeInTheDocument();
  });

  it("hides first-insight banner after localStorage seen-key is set", () => {
    localStorage.setItem("finyk_first_insight_seen_v1", "1");
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -2500)] }),
    });
    expect(screen.queryByText("Ось куди йдуть твої гроші")).toBeNull();
  });

  it("navigates to budgets from insight CTA", () => {
    localStorage.removeItem("finyk_first_insight_seen_v1");
    const onNavigate = vi.fn();
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -2500)] }),
      onNavigate,
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Поставити бюджет" }));
    });
    expect(onNavigate).toHaveBeenCalledWith("budgets");
  });

  it("masks balances when showBalance is false", () => {
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -5000)] }),
      showBalance: false,
    });
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
  });

  it("shows background refresh message while loading with cached data", () => {
    renderOverview({
      mono: buildMono({
        loadingTx: true,
        realTx: [mkTx("t1", -3000)],
      }),
    });
    expect(screen.getByText("Оновлення…")).toBeInTheDocument();
  });
});
