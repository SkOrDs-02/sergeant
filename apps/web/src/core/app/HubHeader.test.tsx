/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mockKyivParts = vi.hoisted(() => ({
  fn: vi.fn(() => ({ year: 2026, month: 6, day: 24, hour: 9 })),
}));
vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDateParts: () => mockKyivParts.fn(),
}));

vi.mock("@shared/hooks", () => ({
  useShortcutGlyph: () => ({ modK: "Ctrl" }),
}));

// Presentational chrome — covered by their own suites. Stub to keep this
// suite focused on HubHeader's greeting / calm-mode / auth-button logic.
vi.mock("@shared/components/ui/ThemeSwitcher", () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher" />,
}));
vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./BrandLogo", () => ({
  BrandLogo: () => <div data-testid="brand-logo" />,
}));
vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: vi.fn(),
}));
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: vi.fn(),
}));
vi.mock("./NotificationBell", () => ({
  NotificationBell: ({ notifications }: { notifications: unknown[] }) => (
    <div data-testid="bell" data-count={notifications.length} />
  ),
}));

import { HubHeader } from "./HubHeader";
import { emitHubBus } from "@shared/lib/modules/hubBus";

function baseProps() {
  return {
    onOpenSearch: vi.fn(),
  };
}

describe("HubHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockKyivParts.fn.mockReturnValue({
      year: 2026,
      month: 6,
      day: 24,
      hour: 9,
    });
  });

  afterEach(() => cleanup());

  it("мова H: H1 головної - сьогоднішня дата, без привітання", () => {
    render(<HubHeader {...baseProps()} />);
    expect(screen.getByTestId("hub-header-title")).toHaveTextContent(
      "Середа, 24 червня",
    );
    expect(screen.queryByText(/Доброго|Доброї|Іван/)).toBeNull();
  });

  it("рядок «зараз · закрито» не рендериться, поки купи не змонтовані", () => {
    render(<HubHeader {...baseProps()} />);
    expect(screen.queryByText(/зараз/)).toBeNull();
  });

  it("opens the assistant chat via the hub bus", () => {
    render(<HubHeader {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Відкрити Сержанта" }));
    expect(emitHubBus).toHaveBeenCalledWith("openChat", {
      message: null,
      autoSend: false,
    });
  });

  it("fires onOpenSearch when the search button is clicked", () => {
    const props = baseProps();
    render(<HubHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Пошук" }));
    expect(props.onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("мова H: дві іконки в шапці, вхід для аноніма живе у tab bar", () => {
    render(<HubHeader {...baseProps()} />);
    expect(
      screen.queryByRole("button", { name: "Увійти в акаунт" }),
    ).not.toBeInTheDocument();
  });

  it("не рендерить меню «⋯»: тема й приватність живуть у Налаштуваннях (огляд 2026-09-04)", () => {
    render(<HubHeader {...baseProps()} />);
    expect(
      screen.queryByRole("button", { name: "Більше" }),
    ).not.toBeInTheDocument();
  });

  // PR-H2 (аудит 2026-09-13 хвиля 5): привітання — єдиний видимий текст на
  // всіх чотирьох вкладках, назва вкладки жила лише в sr-only `<h1>`.
  it("renders no visible subtitle on the dashboard tab", () => {
    render(<HubHeader {...baseProps()} activeTab="dashboard" />);
    expect(screen.queryByText("Налаштування")).not.toBeInTheDocument();
    expect(screen.queryByText("Профіль")).not.toBeInTheDocument();
    expect(screen.queryByText("Звʼязки")).not.toBeInTheDocument();
  });

  it("renders no visible subtitle when activeTab is omitted", () => {
    render(<HubHeader {...baseProps()} />);
    expect(screen.queryByText("Налаштування")).not.toBeInTheDocument();
  });

  it("shows a visible «Налаштування» subtitle under the greeting on the settings tab", () => {
    render(<HubHeader {...baseProps()} activeTab="settings" />);
    expect(screen.getByText("Налаштування")).toBeVisible();
  });

  it("shows a visible «Профіль» subtitle on the profile tab", () => {
    render(<HubHeader {...baseProps()} activeTab="profile" />);
    expect(screen.getByText("Профіль")).toBeVisible();
  });

  it("shows a visible «Звʼязки» subtitle on the reports tab", () => {
    render(<HubHeader {...baseProps()} activeTab="reports" />);
    expect(screen.getByText("Звʼязки")).toBeVisible();
  });

  it("forwards notifications to the bell", () => {
    render(
      <HubHeader
        {...baseProps()}
        notifications={[
          {
            id: "x",
            icon: "bell",
            title: "t",
            actionLabel: "a",
            onAction: vi.fn(),
          },
        ]}
      />,
    );
    expect(screen.getByTestId("bell")).toHaveAttribute("data-count", "1");
  });
});
