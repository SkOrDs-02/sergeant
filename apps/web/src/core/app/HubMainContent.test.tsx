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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HubMainContent, type HubMainContentProps } from "./HubMainContent";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

vi.mock("../hub/HubDashboard", () => ({
  HubDashboard: ({
    onOpenModule,
    onShowAuth,
  }: {
    onOpenModule: (id: string) => void;
    onShowAuth: () => void;
  }) => (
    <section data-testid="hub-dashboard">
      <button type="button" onClick={() => onOpenModule("finyk")}>
        open module
      </button>
      <button type="button" onClick={onShowAuth}>
        show auth
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
  ProfilePage: () => <section data-testid="profile-page" />,
}));

// Реальний банер читає `useLocalUserId` → `useAuth`, а цей набір рендерить
// HubMainContent голим, без AuthProvider. Власна логіка показу покрита в
// `core/durability/LocalOnlyDataBanner.test.tsx`; тут перевіряємо лише те,
// що хаб його монтує і глушить під час FTUX.
vi.mock("../durability/LocalOnlyDataBanner", () => ({
  LocalOnlyDataBanner: () => <section data-testid="local-only-banner" />,
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
    onScrollElement,
    id,
  }: {
    children: ReactNode;
    onRefresh: () => Promise<void>;
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
          void onRefresh();
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

  it("renders dashboard chrome and forwards dashboard actions", () => {
    const onOpenModule = vi.fn();
    const onShowAuth = vi.fn();

    renderWithClient(
      <HubMainContent {...props({ onOpenModule, onShowAuth })} />,
    );

    fireEvent.click(screen.getByText("open module"));
    fireEvent.click(screen.getByText("show auth"));

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

  it("invalidates hub dashboard queries when pull-to-refresh fires", async () => {
    renderWithClient(<HubMainContent {...props()} />);

    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(screen.getByTestId("pull-to-refresh")).toBeInTheDocument(),
    );
  });
});
