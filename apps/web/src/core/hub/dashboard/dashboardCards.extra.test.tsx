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

import { StreakIndicator, WeeklyDigestFooter } from "./dashboardCards";

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

describe("WeeklyDigestFooter", () => {
  it("renders the week range and fires onExpand", () => {
    const onExpand = vi.fn();
    render(<WeeklyDigestFooter onExpand={onExpand} fresh={false} />);
    const button = screen.getByRole("button", { name: /^Звіт тижня/ });
    fireEvent.click(button);
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAccessibleName(/новий/);
  });

  it("announces the fresh state through the button name", () => {
    render(<WeeklyDigestFooter onExpand={vi.fn()} fresh />);
    expect(
      screen.getByRole("button", { name: /^Звіт тижня, новий/ }),
    ).toBeInTheDocument();
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

  // Раніше цей тест стверджував протилежне — «бере найдовший стрік із
  // routine і fizruk». Порівняння було некоректним із моменту, коли Фізрук
  // перейшов на тижневий стрік (`computeWeeklyStreakWeeks`): бейдж
  // підписаний «днів поспіль», тож 9 ТИЖНІВ вигравали в 3 днів і
  // показувались як «9 днів», а `streak_milestone_reached` отримував ту
  // саму цифру як `days` (аудит L-8, 2026-08-07). Максимум над різними
  // одиницями не має сенсу — Фізрук тут просто не бере участі.
  it("ігнорує тижневий стрік Фізрука і показує денний стрік Рутини", () => {
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ streak: 3 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.FIZRUK_QUICK_STATS,
      JSON.stringify({ streak: 9 }),
    );
    render(<StreakIndicator />);
    expect(document.body.textContent).toContain("3");
    expect(document.body.textContent).not.toContain("9");
  });
});
