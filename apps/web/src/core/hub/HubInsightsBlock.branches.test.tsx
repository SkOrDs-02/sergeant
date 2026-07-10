/** @vitest-environment jsdom */
/**
 * Branch coverage for HubInsightsBlock — collapsed subtitle branches,
 * module insight activation, digest footer vs expanded card.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
const emitHubBusMock = vi.fn();

const insightsState = vi.hoisted(() => ({
  items: [] as Array<{
    id: string;
    title: string;
    subtitle: string;
    action:
      | { type: "navigate"; path: string }
      | { type: "open-chat"; prompt: string }
      | { type: "callback"; fn: () => void };
  }>,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: (...args: unknown[]) => emitHubBusMock(...args),
}));

vi.mock("@shared/lib/insights/useAllInsights", () => ({
  useAllInsights: () => insightsState.items,
}));

vi.mock("@shared/components/ui/CollapsibleSection", () => ({
  CollapsibleSection: ({
    title,
    collapsedSubtitle,
    children,
  }: {
    title: string;
    collapsedSubtitle: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      <p data-testid="collapsed-subtitle">{collapsedSubtitle}</p>
      {children}
    </section>
  ),
}));

vi.mock("@shared/components/ui/InsightCard", () => ({
  InsightCard: ({
    title,
    onActivate,
  }: {
    title: string;
    onActivate: () => void;
  }) => (
    <button type="button" onClick={onActivate}>
      {title}
    </button>
  ),
}));

vi.mock("../insights/AssistantAdviceCard", () => ({
  AssistantAdviceCard: () => <div data-testid="coach-card" />,
}));
vi.mock("../onboarding/DailyNudge", () => ({
  DailyNudge: () => <div data-testid="daily-nudge" />,
}));
vi.mock("./HubInsightsPanel", () => ({
  HubInsightsPanel: () => <div data-testid="insights-panel" />,
}));
vi.mock("../insights/WeeklyDigestCard", () => ({
  WeeklyDigestCard: ({ onCollapse }: { onCollapse: () => void }) => (
    <button type="button" onClick={onCollapse}>
      collapse-digest
    </button>
  ),
}));
vi.mock("./dashboard/dashboardCards", () => ({
  WeeklyDigestFooter: ({ onExpand }: { onExpand: () => void }) => (
    <button type="button" onClick={onExpand}>
      expand-digest
    </button>
  ),
}));

import { HubInsightsBlock } from "./HubInsightsBlock";

function baseProps(
  overrides: Partial<Parameters<typeof HubInsightsBlock>[0]> = {},
) {
  return {
    insightsDefaultOpen: true,
    coachLoading: false,
    coachError: null,
    coachInsightText: null,
    coachRefresh: vi.fn(),
    rest: [],
    digestFresh: false,
    activeNudge: null,
    reengagementShow: false,
    sessionDays: 1,
    dismissNudge: vi.fn(),
    openInsightTarget: vi.fn(),
    dismiss: vi.fn(),
    digestExpanded: false,
    setDigestExpanded: vi.fn(),
    showDigestFooter: false,
    ...overrides,
  };
}

describe("HubInsightsBlock", () => {
  afterEach(() => {
    cleanup();
    insightsState.items = [];
    navigateMock.mockReset();
    emitHubBusMock.mockReset();
  });

  it("shows loading copy in the collapsed subtitle while coach advice loads", () => {
    render(
      <MemoryRouter>
        <HubInsightsBlock {...baseProps({ coachLoading: true })} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("collapsed-subtitle")).toHaveTextContent(
      "Готую AI-пораду…",
    );
  });

  it("navigates when a module insight action is navigate", () => {
    insightsState.items = [
      {
        id: "i1",
        title: "Go finyk",
        subtitle: "",
        action: { type: "navigate", path: "/finyk" },
      },
    ];
    render(
      <MemoryRouter>
        <HubInsightsBlock {...baseProps()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go finyk" }));
    expect(navigateMock).toHaveBeenCalledWith("/finyk");
  });

  it("opens chat via hub bus for open-chat insight actions", () => {
    insightsState.items = [
      {
        id: "i2",
        title: "Ask AI",
        subtitle: "",
        action: { type: "open-chat", prompt: "help me budget" },
      },
    ];
    render(
      <MemoryRouter>
        <HubInsightsBlock {...baseProps()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(emitHubBusMock).toHaveBeenCalledWith("openChat", {
      message: "help me budget",
      autoSend: false,
    });
  });

  it("renders digest footer and expanded card on opposite branches", () => {
    const setDigestExpanded = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <HubInsightsBlock
          {...baseProps({ showDigestFooter: true, setDigestExpanded })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "expand-digest" }));
    expect(setDigestExpanded).toHaveBeenCalledWith(true);

    rerender(
      <MemoryRouter>
        <HubInsightsBlock
          {...baseProps({ digestExpanded: true, setDigestExpanded })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "collapse-digest" }));
    expect(setDigestExpanded).toHaveBeenCalledWith(false);
  });
});
