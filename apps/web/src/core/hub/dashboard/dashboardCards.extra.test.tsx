/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { emitHubBus, __resetHubBusForTests } from "@shared/lib/modules/hubBus";
import { STORAGE_KEYS } from "@sergeant/shared";

// Control per-module previews so TodaySummaryStrip render branches are
// deterministic (empty -> hidden; some-data -> pill strip).
const previews: Record<string, { main: string }> = {
  finyk: { main: "" },
  routine: { main: "" },
  nutrition: { main: "" },
  fizruk: { main: "" },
};
vi.mock("./moduleConfigs", () => ({
  MODULE_CONFIGS: new Proxy(
    {},
    {
      get: (_t, id: string) => ({
        label: `lbl-${id}`,
        getPreview: () => previews[id] ?? { main: "" },
      }),
    },
  ),
}));

// Spy on analytics to assert milestone tracking without a real transport.
const trackEvent = vi.fn();
vi.mock("../../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  ANALYTICS_EVENTS: { STREAK_MILESTONE_REACHED: "streak_milestone_reached" },
}));

import {
  StaggerChild,
  StreakIndicator,
  TodaySummaryStrip,
  WeeklyDigestFooter,
} from "./dashboardCards";

beforeEach(() => {
  localStorage.clear();
  __resetHubBusForTests();
  for (const k of Object.keys(previews)) previews[k] = { main: "" };
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  __resetHubBusForTests();
  vi.clearAllMocks();
});

describe("TodaySummaryStrip", () => {
  it("renders nothing when no module has data", () => {
    const { container } = render(<TodaySummaryStrip onOpenModule={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders pills and fires onOpenModule when a module has data", () => {
    previews["finyk"] = { main: "1 200 ₴" };
    const onOpenModule = vi.fn();
    render(<TodaySummaryStrip onOpenModule={onOpenModule} />);
    expect(screen.getByText("1 200 ₴")).toBeInTheDocument();
    // Each pill carries the module label.
    fireEvent.click(screen.getByText("lbl-finyk"));
    expect(onOpenModule).toHaveBeenCalledWith("finyk");
  });

  it("renders an em-dash placeholder for modules without a value", () => {
    previews["finyk"] = { main: "5" };
    render(<TodaySummaryStrip onOpenModule={vi.fn()} />);
    // routine/nutrition/fizruk have no data -> em-dash placeholders.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("StaggerChild", () => {
  it("applies an animation delay scaled by index", () => {
    const { container } = render(
      <StaggerChild index={2}>
        <span>child</span>
      </StaggerChild>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.animationDelay).toBe("60ms");
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("caps the animation delay at 150ms for large indices", () => {
    const { container } = render(
      <StaggerChild index={20}>
        <span>x</span>
      </StaggerChild>,
    );
    expect((container.firstChild as HTMLElement).style.animationDelay).toBe(
      "150ms",
    );
  });
});

describe("WeeklyDigestFooter", () => {
  it("renders the week range and fires onExpand", () => {
    const onExpand = vi.fn();
    render(<WeeklyDigestFooter onExpand={onExpand} fresh={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Розгорнути звіт тижня" }),
    );
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Новий звіт")).not.toBeInTheDocument();
  });

  it("shows the fresh dot when fresh is true", () => {
    render(<WeeklyDigestFooter onExpand={vi.fn()} fresh />);
    expect(screen.getByLabelText("Новий звіт")).toBeInTheDocument();
  });
});

describe("StreakIndicator — milestone tracking + legacy fallback", () => {
  it("reads streak from legacy bare-JSON quick-stats keys", () => {
    // Legacy clients wrote bare JSON under the un-namespaced key.
    localStorage.setItem("routine_quick_stats", JSON.stringify({ streak: 4 }));
    render(<StreakIndicator />);
    expect(document.body.textContent).toContain("4");
  });

  it("tracks streak_milestone_reached when a milestone is crossed", () => {
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ streak: 6 }),
    );
    render(<StreakIndicator />);
    expect(trackEvent).not.toHaveBeenCalled();

    // Cross the 7-day milestone.
    act(() => {
      localStorage.setItem(
        STORAGE_KEYS.ROUTINE_QUICK_STATS,
        JSON.stringify({ streak: 8 }),
      );
      emitHubBus("storageUpdated", undefined);
    });

    expect(trackEvent).toHaveBeenCalledWith("streak_milestone_reached", {
      days: 7,
      type: "toast",
    });
  });

  it("does not track when the streak only grows within a milestone band", () => {
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ streak: 8 }),
    );
    render(<StreakIndicator />);

    act(() => {
      localStorage.setItem(
        STORAGE_KEYS.ROUTINE_QUICK_STATS,
        JSON.stringify({ streak: 10 }),
      );
      emitHubBus("storageUpdated", undefined);
    });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("picks the longest streak across routine and fizruk", () => {
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ streak: 3 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.FIZRUK_QUICK_STATS,
      JSON.stringify({ streak: 9 }),
    );
    render(<StreakIndicator />);
    expect(document.body.textContent).toContain("9");
  });
});
