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
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { Overview } from "./Overview";
import type { useStorage } from "../hooks/useStorage";
import type { useUnifiedFinanceData } from "../hooks/useUnifiedFinanceData";
import { useOpenSignIn } from "../../../core/auth/useOpenSignIn";

vi.mock("../../../core/auth/useLocalUserId", () => ({
  useLocalUserId: () => "local-anon",
}));

// `vi.fn()`-обгортка (не голий `() => null`), щоб один тест міг
// підмінити реалізацію через `mockImplementationOnce` і перевірити, куди
// саме `Overview` веде `onSignIn` — решта тестів файлу banner не бачать.
vi.mock("../../../core/durability/LocalOnlyDataBanner", () => ({
  LocalOnlyDataBanner: vi.fn(() => null),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocalOnlyDataBanner } from "../../../core/durability/LocalOnlyDataBanner";

const KYIV = new Date("2026-06-15T09:00:00Z");

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

function Providers({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {children}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="router-location">
      {location.pathname}
      {location.search}
    </span>
  );
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
    onOpenAuth: () => void;
  }> = {},
) {
  const overviewProps = {
    mono: buildMono(props.mono),
    storage: buildStorage(props.storage),
    showBalance: props.showBalance ?? true,
    // `onOpenAuth` обовʼязковий (A1) — тести, яким байдуже до входу,
    // дістають безпечний no-op, а не `undefined`.
    onOpenAuth: props.onOpenAuth ?? vi.fn(),
    ...(props.onNavigate ? { onNavigate: props.onNavigate } : {}),
  };
  return render(
    <Providers>
      <Overview {...overviewProps} />
    </Providers>,
  );
}

/**
 * Той самий спосіб підключення `onOpenAuth`, яким `FinykApp.tsx` реально
 * зʼєднує `Overview` з shell-ом (`route.tsx` → `useHubShell().onOpenAuth`
 * → `RootLayout.tsx` → `useOpenSignIn()`). На відміну від `renderOverview`
 * вище (яка дає безпечний `vi.fn()` для тестів, яким вхід байдужий), тут
 * підключений СПРАВЖНІЙ хук — потрібно для мутаційної перевірки нижче.
 */
function OverviewWithRealSignIn(props: {
  mono: MergedMonoLike;
  storage: StorageLike;
}) {
  const onOpenAuth = useOpenSignIn();
  return <Overview {...props} onOpenAuth={onOpenAuth} />;
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
    expect(screen.queryByText("Капітал")).toBeNull();
  });

  it("renders hero content when transactions are available", () => {
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -5000)] }),
    });
    expect(screen.getByText("Капітал")).toBeInTheDocument();
    expect(screen.getByText("Сьогодні")).toBeInTheDocument();
  });

  it("opens the today-filtered transaction route from the daily summary", () => {
    renderOverview({
      mono: buildMono({ realTx: [mkTx("t1", -5000)] }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити операції за сьогодні" }),
    );
    expect(screen.getByTestId("router-location")).toHaveTextContent(
      "/finyk/transactions?date=today",
    );
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

  // Регресія A1 (аудит 2026-09-11, хвиля 2): `onSignIn` банера раніше
  // мав фолбек `onOpenAuth ?? (() => navigate("/auth"))` — зайвий
  // редірект-хоп замість прямого SPA-переходу на `/sign-in`. `onOpenAuth`
  // тепер обовʼязковий пропс, а Overview передає його в банер БЕЗ
  // жодної обгортки. Тест підключає той самий `useOpenSignIn()`, яким
  // реально користується продакшн-shell (`RootLayout.tsx`).
  it("onOpenAuth веде на /sign-in прямим SPA-переходом, без /auth-хопу", () => {
    vi.mocked(LocalOnlyDataBanner).mockImplementationOnce(
      ({ onSignIn }: { onSignIn: () => void }) => (
        <button type="button" onClick={onSignIn}>
          відкрити вхід (banner)
        </button>
      ),
    );
    render(
      <Providers>
        <OverviewWithRealSignIn
          mono={buildMono({ realTx: [mkTx("t1", -1000)] })}
          storage={buildStorage()}
        />
      </Providers>,
    );

    expect(screen.getByTestId("router-location")).toHaveTextContent("/");

    fireEvent.click(
      screen.getByRole("button", { name: "відкрити вхід (banner)" }),
    );

    // Жодного проміжного маршруту `/auth` у цьому дереві немає — якби
    // код і далі ходив через аліас, локація лишилась би на ньому: цей
    // ізольований тест не монтує `StandaloneRoutes`, що робить редірект
    // `/auth` → `/sign-in` у справжньому застосунку.
    expect(screen.getByTestId("router-location")).toHaveTextContent("/sign-in");
  });
});
