/** @vitest-environment jsdom */
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  HubDashboard: () => <section data-testid="hub-dashboard" />,
}));

vi.mock("../hub/HubReports", () => ({
  HubReports: () => <section data-testid="hub-reports" />,
}));

vi.mock("../hub/HubSettingsPage", () => ({
  HubSettingsPage: () => <section data-testid="hub-settings" />,
}));

vi.mock("../profile/ProfilePage", () => ({
  ProfilePage: () => <section data-testid="profile-page" />,
}));

vi.mock("./IOSInstallBanner", () => ({
  IOSInstallBanner: () => <section data-testid="ios-install-banner" />,
}));

function props(
  overrides: Partial<HubMainContentProps> = {},
): HubMainContentProps {
  return {
    onOpenModule: vi.fn(),
    iosVisible: false,
    onDismissIos: vi.fn(),
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
  afterEach(() => cleanup());

  it("suppresses the iOS install banner while the user is in FTUX", () => {
    renderWithClient(
      <HubMainContent {...props({ iosVisible: true, inFtuxSession: true })} />,
    );

    expect(screen.queryByTestId("ios-install-banner")).toBeNull();
    expect(screen.getByTestId("hub-dashboard")).toBeInTheDocument();
  });

  it("shows the iOS install banner outside FTUX when iosVisible is set", () => {
    renderWithClient(<HubMainContent {...props({ iosVisible: true })} />);

    expect(screen.getByTestId("ios-install-banner")).toBeInTheDocument();
  });
});
