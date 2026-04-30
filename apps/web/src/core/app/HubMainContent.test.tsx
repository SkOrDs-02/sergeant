/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HubMainContent, type HubMainContentProps } from "./HubMainContent";

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

const replacementCharPattern = new RegExp(String.fromCharCode(0xfffd));

function props(
  overrides: Partial<HubMainContentProps> = {},
): HubMainContentProps {
  return {
    updateAvailable: false,
    onApplyUpdate: vi.fn(),
    canInstall: false,
    onInstall: vi.fn(async () => undefined),
    onDismissInstall: vi.fn(),
    onOpenModule: vi.fn(),
    iosVisible: false,
    onDismissIos: vi.fn(),
    hubView: "dashboard",
    onOpenChat: vi.fn(),
    syncing: false,
    onSync: vi.fn(),
    onPull: vi.fn(),
    user: null,
    onShowAuth: vi.fn(),
    ...overrides,
  };
}

describe("HubMainContent chrome banners", () => {
  afterEach(() => cleanup());

  it("suppresses all install/update chrome while the user is in FTUX", () => {
    render(
      <HubMainContent
        {...props({
          updateAvailable: true,
          canInstall: true,
          iosVisible: true,
          inFtuxSession: true,
        })}
      />,
    );

    expect(screen.queryByText("Доступна нова версія")).toBeNull();
    expect(screen.queryByText("Встановити додаток")).toBeNull();
    expect(screen.queryByTestId("ios-install-banner")).toBeNull();
    expect(screen.getByTestId("hub-dashboard")).toBeInTheDocument();
  });

  it("shows only the highest-priority available banner", () => {
    render(
      <HubMainContent
        {...props({
          updateAvailable: true,
          canInstall: true,
          iosVisible: true,
        })}
      />,
    );

    expect(screen.getByText("Доступна нова версія")).toBeInTheDocument();
    expect(screen.queryByText("Встановити додаток")).toBeNull();
    expect(screen.queryByTestId("ios-install-banner")).toBeNull();
  });

  it("renders clean Ukrainian install copy without replacement characters", () => {
    render(<HubMainContent {...props({ canInstall: true })} />);

    expect(screen.getByText("Встановити додаток")).toBeInTheDocument();
    expect(
      screen.getByText("Офлайн · пуш-нагадування · ярлик на екрані"),
    ).toBeInTheDocument();
    expect(screen.queryByText(replacementCharPattern)).toBeNull();
  });
});
