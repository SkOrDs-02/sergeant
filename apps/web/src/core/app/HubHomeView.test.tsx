/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { User } from "@sergeant/shared";

const gates = vi.hoisted(() => ({
  hasAnyRealEntry: vi.fn(() => true),
  isFirstRealEntryDone: vi.fn(() => true),
  shouldShowOnboarding: vi.fn(() => false),
}));
vi.mock("../onboarding/firstRealEntry", () => ({
  hasAnyRealEntry: gates.hasAnyRealEntry,
}));
vi.mock("../onboarding/vibePicks", () => ({
  isFirstRealEntryDone: gates.isFirstRealEntryDone,
}));
vi.mock("../onboarding/onboardingGate", () => ({
  shouldShowOnboarding: gates.shouldShowOnboarding,
  isDemoActive: () => false,
}));

vi.mock("../whatsNew", () => ({
  useWhatsNew: () => ({
    open: false,
    release: null,
    onClose: vi.fn(),
    onCtaClick: vi.fn(),
  }),
}));

// Capture the notifications prop handed to the header so we can assert the
// FTUX-suppression / update / install logic without rendering the real bell.
const captured = vi.hoisted(
  () =>
    ({ notifications: undefined }) as {
      notifications: { id: string }[] | undefined;
    },
);
vi.mock("./HubHeader", () => ({
  HubHeader: (props: { notifications?: { id: string }[] }) => {
    captured.notifications = props.notifications;
    return <div data-testid="hub-header" />;
  },
}));
vi.mock("./NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("./HubMainContent", () => ({
  HubMainContent: () => <div data-testid="hub-main" />,
}));
vi.mock("./HubBottomNav", () => ({
  HubBottomNav: () => <div data-testid="hub-bottom-nav" />,
}));
vi.mock("./HubModals", () => ({ HubModals: () => null }));
vi.mock("./ActiveWorkoutBanner", () => ({
  ActiveWorkoutBanner: (props: { hidden?: boolean }) => (
    <div data-testid="active-workout" data-hidden={String(!!props.hidden)} />
  ),
}));
vi.mock("./OfflineBanner", () => ({ OfflineBanner: () => null }));
vi.mock("../hints/HintsOrchestrator", () => ({
  HintsOrchestrator: () => null,
}));
vi.mock("@shared/components/layout/MeshBackground", () => ({
  MeshBackground: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@shared/components/ui/AIPill", () => ({
  AIPill: () => <div data-testid="ai-pill" />,
}));
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubSettingsSection: vi.fn(),
}));

import { HubHomeView, type HubHomeViewProps } from "./HubHomeView";

function makeUi(overrides: Partial<HubHomeViewProps["ui"]> = {}) {
  return {
    searchOpen: false,
    hubView: "dashboard",
    setHubView: vi.fn(),
    setSearchOpen: vi.fn(),
    closeSearch: vi.fn(),
    ...overrides,
  } as HubHomeViewProps["ui"];
}

function props(overrides: Partial<HubHomeViewProps> = {}): HubHomeViewProps {
  return {
    ui: makeUi(),
    user: { name: "Іван" } as User,
    authLoading: false,
    onOpenAuth: vi.fn(),
    canInstall: false,
    onInstall: vi.fn().mockResolvedValue(undefined),
    onDismissInstall: vi.fn(),
    iosVisible: false,
    onDismissIos: vi.fn(),
    updateAvailable: false,
    onApplyUpdate: vi.fn(),
    openModule: vi.fn(),
    shortcutsOpen: false,
    onCloseShortcuts: vi.fn(),
    ...overrides,
  };
}

describe("HubHomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gates.hasAnyRealEntry.mockReturnValue(true);
    gates.isFirstRealEntryDone.mockReturnValue(true);
    gates.shouldShowOnboarding.mockReturnValue(false);
    captured.notifications = undefined;
  });

  afterEach(() => cleanup());

  it("renders the hub shell scaffolding", () => {
    render(<HubHomeView {...props()} />);
    expect(screen.getByTestId("hub-header")).toBeInTheDocument();
    expect(screen.getByTestId("hub-main")).toBeInTheDocument();
    expect(screen.getByTestId("hub-bottom-nav")).toBeInTheDocument();
  });

  it("passes no notifications when nothing is pending", () => {
    render(<HubHomeView {...props()} />);
    expect(captured.notifications).toEqual([]);
  });

  it("surfaces an SW-update notification when an update is available", () => {
    render(<HubHomeView {...props({ updateAvailable: true })} />);
    expect(captured.notifications?.map((n) => n.id)).toContain("sw-update");
  });

  it("surfaces a PWA-install notification when installable", () => {
    render(<HubHomeView {...props({ canInstall: true })} />);
    expect(captured.notifications?.map((n) => n.id)).toContain("pwa-install");
  });

  it("suppresses notifications during the FTUX session", () => {
    // No real entry yet AND first-real-entry not done → inFtuxSession = true.
    gates.hasAnyRealEntry.mockReturnValue(false);
    gates.isFirstRealEntryDone.mockReturnValue(false);
    render(
      <HubHomeView {...props({ updateAvailable: true, canInstall: true })} />,
    );
    expect(captured.notifications).toEqual([]);
  });

  it("hides the active-workout banner during FTUX", () => {
    gates.hasAnyRealEntry.mockReturnValue(false);
    gates.isFirstRealEntryDone.mockReturnValue(false);
    render(<HubHomeView {...props()} />);
    expect(screen.getByTestId("active-workout")).toHaveAttribute(
      "data-hidden",
      "true",
    );
  });

  it("shows the AI pill on the dashboard tab outside FTUX", () => {
    render(<HubHomeView {...props()} />);
    expect(screen.getByTestId("ai-pill")).toBeInTheDocument();
  });

  it("hides the AI pill when not on the dashboard tab", () => {
    render(<HubHomeView {...props({ ui: makeUi({ hubView: "reports" }) })} />);
    expect(screen.queryByTestId("ai-pill")).not.toBeInTheDocument();
  });
});
