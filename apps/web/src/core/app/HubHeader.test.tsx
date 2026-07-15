/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { User } from "@sergeant/shared";

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
    user: null as User | null,
    onShowAuth: vi.fn(),
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

  it("renders the morning greeting for a 09:00 Kyiv hour", () => {
    render(<HubHeader {...baseProps()} />);
    expect(screen.getByText(/Доброго ранку/)).toBeInTheDocument();
  });

  it("personalises the greeting with the user's first name", () => {
    const user = { name: "Іван Петренко" } as User;
    render(<HubHeader {...baseProps()} user={user} />);
    expect(screen.getByText(/Доброго ранку, Іван/)).toBeInTheDocument();
  });

  it("picks the night greeting before 05:00", () => {
    mockKyivParts.fn.mockReturnValue({
      year: 2026,
      month: 6,
      day: 24,
      hour: 3,
    });
    render(<HubHeader {...baseProps()} />);
    expect(screen.getByText(/Доброї ночі/)).toBeInTheDocument();
  });

  it("opens the assistant chat via the hub bus", () => {
    render(<HubHeader {...baseProps()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }),
    );
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

  it("shows the sign-in button for guests and calls onShowAuth", () => {
    const props = baseProps();
    render(<HubHeader {...props} />);
    const signIn = screen.getByRole("button", { name: "Увійти в акаунт" });
    fireEvent.click(signIn);
    expect(props.onShowAuth).toHaveBeenCalledTimes(1);
  });

  it("hides the sign-in button when a user is present", () => {
    const user = { name: "Іван" } as User;
    render(<HubHeader {...baseProps()} user={user} />);
    expect(
      screen.queryByRole("button", { name: "Увійти в акаунт" }),
    ).not.toBeInTheDocument();
  });

  it("hides the sign-in button when hideAuthButton is set", () => {
    render(<HubHeader {...baseProps()} hideAuthButton />);
    expect(
      screen.queryByRole("button", { name: "Увійти в акаунт" }),
    ).not.toBeInTheDocument();
  });

  it("shows the privacy status row in the overflow menu only when onOpenPrivacy is provided", () => {
    const privacyName = /Тільки ти/i;

    const { unmount } = render(<HubHeader {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Більше" }));
    expect(screen.queryByText(privacyName)).not.toBeInTheDocument();
    unmount();

    const onOpenPrivacy = vi.fn();
    render(<HubHeader {...baseProps()} onOpenPrivacy={onOpenPrivacy} />);
    fireEvent.click(screen.getByRole("button", { name: "Більше" }));
    fireEvent.click(screen.getByRole("button", { name: privacyName }));
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
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
