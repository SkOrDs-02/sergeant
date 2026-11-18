/** @vitest-environment jsdom */
import { Suspense, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import {
  REQUEST_PULL_EVENT,
  emitCloudPullComplete,
} from "@shared/lib/modules/cloudPullRequest";
import { HubMainContent, type HubMainContentProps } from "./HubMainContent";

function renderWithClient(ui: ReactElement, initialEntry = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            {children}
            <ToastContainer />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

vi.mock("../hub/HubDashboard", () => ({
  HubDashboard: ({ onOpenModule }: { onOpenModule: (id: string) => void }) => (
    <section data-testid="hub-dashboard">
      <button type="button" onClick={() => onOpenModule("finyk")}>
        open module
      </button>
    </section>
  ),
}));

vi.mock("../hub/HubReports", () => ({
  HubReports: () => <section data-testid="hub-reports" />,
}));

vi.mock("../hub/HubSettingsPage", () => ({
  HubSettingsPage: ({
    scrollContainer,
  }: {
    scrollContainer: HTMLDivElement | null;
  }) => (
    <section data-testid="hub-settings">
      {scrollContainer ? "has scroll container" : "no scroll container"}
    </section>
  ),
}));

vi.mock("../profile/ProfilePage", () => ({
  ProfilePage: ({
    scrollContainer,
  }: {
    scrollContainer: HTMLElement | null;
  }) => (
    <section data-testid="profile-page">
      {scrollContainer ? "has scroll container" : "no scroll container"}
    </section>
  ),
}));

// Реальний банер читає `useLocalUserId` → `useAuth`, а цей набір рендерить
// HubMainContent голим, без AuthProvider. Власна логіка показу покрита в
// `core/durability/LocalOnlyDataBanner.test.tsx`; тут перевіряємо лише те,
// що хаб його монтує і глушить під час FTUX.
vi.mock("../durability/LocalOnlyDataBanner", () => ({
  LocalOnlyDataBanner: ({ onSignIn }: { onSignIn: () => void }) => (
    <section data-testid="local-only-banner">
      <button type="button" onClick={onSignIn}>
        banner sign in
      </button>
    </section>
  ),
}));

vi.mock("@shared/components/ui/SuspenseWithMinDelay", () => ({
  SuspenseWithMinDelay: ({
    children,
    fallback,
  }: {
    children: ReactNode;
    fallback: ReactNode;
  }) => <Suspense fallback={fallback}>{children}</Suspense>,
}));

vi.mock("@shared/components/ui/PullToRefresh", () => ({
  PullToRefresh: ({
    children,
    onRefresh,
    onError,
    onScrollElement,
    id,
  }: {
    children: ReactNode;
    onRefresh: () => Promise<void>;
    onError?: (err: unknown) => void;
    onScrollElement: (el: HTMLDivElement | null) => void;
    id?: string;
  }) => (
    <main id={id} data-testid="pull-to-refresh">
      <div
        data-testid="scroll-container"
        ref={(el) => {
          onScrollElement(el);
        }}
      />
      <button
        type="button"
        onClick={() => {
          // Як справжній хук жесту: відмова йде в `onError`.
          onRefresh().catch((err: unknown) => onError?.(err));
        }}
      >
        refresh
      </button>
      {children}
    </main>
  ),
}));

const beginHubTabSwitchMock = vi.fn();
const endHubTabSwitchMock = vi.fn();
vi.mock("../lib/hubPerf", () => ({
  beginHubTabSwitch: (tab: string) => beginHubTabSwitchMock(tab),
  endHubTabSwitch: (tab: string) => endHubTabSwitchMock(tab),
}));

function props(
  overrides: Partial<HubMainContentProps> = {},
): HubMainContentProps {
  return {
    onOpenModule: vi.fn(),
    hubView: "dashboard",
    user: null,
    onShowAuth: vi.fn(),
    ...overrides,
  };
}

// SW-update + PWA-install chrome moved to the header `NotificationBell`
// (C · Контроль home redesign) — their banner behaviour is covered by the
// bell's own surface now. HubMainContent only owns the inline iOS-install
// banner + its FTUX suppression.
describe("HubMainContent iOS install banner", () => {
  beforeEach(() => {
    beginHubTabSwitchMock.mockClear();
    endHubTabSwitchMock.mockClear();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => cleanup());

  it("тримає один сигнал на екрані в FTUX", () => {
    renderWithClient(<HubMainContent {...props({ inFtuxSession: true })} />);

    expect(screen.getByTestId("hub-dashboard")).toBeInTheDocument();
    // Перша сесія тримає рівно один сигнал на екрані — CTA першої дії.
    expect(screen.queryByTestId("local-only-banner")).toBeNull();
  });

  it("mounts the local-only durability banner on the dashboard outside FTUX", () => {
    // Канон finyk §6.2: попередження про несинхронізовані дані жило лише
    // всередині finyk/Overview, тож відвідувач у routine / nutrition /
    // fizruk його не бачив. Хаб — спільний дах, банер належить сюди.
    renderWithClient(<HubMainContent {...props()} />);

    expect(screen.getByTestId("local-only-banner")).toBeInTheDocument();
  });

  it("ставить банер про локальні дані ПІСЛЯ дашборда, а не над ним", () => {
    // Бурштинове попередження стояло першим, над модулями й «Зараз», тож
    // новачок першим читав загрозу втрати даних, а не свій наступний крок
    // (критика екранів 2026-09-23). Банер лишається на хабі (канон finyk
    // §6.2), але під тим, заради чого людина прийшла.
    renderWithClient(<HubMainContent {...props()} />);
    const dashboard = screen.getByTestId("hub-dashboard");
    const banner = screen.getByTestId("local-only-banner");
    expect(
      dashboard.compareDocumentPosition(banner) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Рішення власника 2026-11-17: soft-auth картку з дашборда знято, її
  // текст несе банер локальних даних, тож вхід на хабі веде лише він.
  it("renders dashboard chrome; sign-in goes through the local-only banner", () => {
    const onOpenModule = vi.fn();
    const onShowAuth = vi.fn();

    renderWithClient(
      <HubMainContent {...props({ onOpenModule, onShowAuth })} />,
    );

    fireEvent.click(screen.getByText("open module"));
    fireEvent.click(screen.getByText("banner sign in"));

    expect(onOpenModule).toHaveBeenCalledWith("finyk");
    expect(onShowAuth).toHaveBeenCalledTimes(1);
    expect(beginHubTabSwitchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["reports", "hub-reports"],
    ["profile", "profile-page"],
    ["settings", "hub-settings"],
  ] as const)(
    "renders the %s tab through its lazy boundary",
    async (hubView, testId) => {
      renderWithClient(<HubMainContent {...props({ hubView })} />);

      expect(beginHubTabSwitchMock).toHaveBeenCalledWith(hubView);
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      await waitFor(() =>
        expect(endHubTabSwitchMock).toHaveBeenCalledWith(hubView),
      );
    },
  );

  // PR-H2 (аудит 2026-09-13, хвиля 5; перевалідація 2026-11-17): вкладка
  // «Профіль» оголошувала скрінрідеру «Головна», бо `h1` дашборда стояв і
  // на ній. Тепер кожна гілка має рівно один `h1` зі своєю назвою: дашборд і
  // Звʼязки ставлять його тут, Профіль і Налаштування несуть власний у
  // сторінці (`ProfilePage.tsx`, `HubSettingsPage.tsx`; тут вони замокані,
  // тож чужого `h1` у їхніх гілках бути не може).
  it.each([
    ["dashboard", "hub-dashboard", ["Головна"]],
    ["reports", "hub-reports", ["Звʼязки"]],
    ["profile", "profile-page", []],
    ["settings", "hub-settings", []],
  ] as const)(
    "вкладка %s не несе чужого h1",
    async (hubView, testId, expected) => {
      renderWithClient(<HubMainContent {...props({ hubView })} />);
      await screen.findByTestId(testId);
      const names = screen
        .queryAllByRole("heading", { level: 1 })
        .map((h) => h.textContent);
      expect(names).toEqual(expected);
    },
  );

  it("передає Профілю контейнер і не перебиває ціль секції відновленням позиції вкладки", async () => {
    const { rerender } = renderWithClient(
      <HubMainContent {...props()} />,
      "/?tab=profile#profile-memory",
    );
    const host = screen.getByTestId("scroll-container");
    host.scrollTo = vi.fn();
    rerender(<HubMainContent {...props({ hubView: "profile" })} />);
    expect(await screen.findByTestId("profile-page")).toHaveTextContent(
      "has scroll container",
    );
    expect(host.scrollTo).not.toHaveBeenCalled();
  });

  it("invalidates hub dashboard queries when pull-to-refresh fires", async () => {
    renderWithClient(<HubMainContent {...props()} />);

    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(screen.getByTestId("pull-to-refresh")).toBeInTheDocument(),
    );
  });

  // PR-X3 (хвиля 8): жест на хабі просить хмарний пул, і його провал
  // (офлайн, 5xx) доходить до тосту з «Повторити», а не тоне мовчки.
  it("pull-to-refresh просить хмарний пул і показує тост із «Повторити» на провалі", async () => {
    let pulls = 0;
    const failPull = () => {
      pulls += 1;
      emitCloudPullComplete({ ok: false });
    };
    window.addEventListener(REQUEST_PULL_EVENT, failPull);
    try {
      renderWithClient(<HubMainContent {...props()} />);
      fireEvent.click(screen.getByText("refresh"));

      expect(
        await screen.findByText("Не вдалося оновити дані. Перевір зʼєднання."),
      ).toBeInTheDocument();
      expect(pulls).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "Повторити" }));
      await waitFor(() => expect(pulls).toBe(2));
    } finally {
      window.removeEventListener(REQUEST_PULL_EVENT, failPull);
    }
  });
});
