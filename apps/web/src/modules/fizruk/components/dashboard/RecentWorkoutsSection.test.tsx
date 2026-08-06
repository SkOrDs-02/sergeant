// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { DashboardRecentWorkout } from "@sergeant/fizruk-domain/domain";

import { RecentWorkoutsSection } from "./RecentWorkoutsSection";

afterEach(() => {
  cleanup();
});

function row(
  overrides: Partial<DashboardRecentWorkout> = {},
): DashboardRecentWorkout {
  return {
    startedAt: "2026-04-23T09:30:00.000Z",
    endedAt: "2026-04-23T10:15:00.000Z",
    durationSec: 45 * 60,
    itemsCount: 5,
    tonnageKg: 1200,
    label: "Понеділок · Груди + трицепс",
    ...overrides,
  };
}

describe("RecentWorkoutsSection", () => {
  it("shows an empty-state card and hides the 'Усі' link when the list is empty", () => {
    const onSeeAll = vi.fn();
    render(<RecentWorkoutsSection recent={[]} onSeeAll={onSeeAll} />);
    expect(screen.getByText("Ще жодного завершеного тренування")).toBeDefined();
    expect(screen.queryByLabelText("Усі тренування")).toBeNull();
  });

  it("renders each recent workout with its label, duration and tonnage", () => {
    const onSeeAll = vi.fn();
    const recent = [
      row({ label: "Ноги", durationSec: 30 * 60, tonnageKg: 850 }),
      row({
        startedAt: "2026-04-22T09:30:00.000Z",
        endedAt: "2026-04-22T11:00:00.000Z",
        label: "Спина",
        durationSec: 90 * 60,
        tonnageKg: 1500,
      }),
    ];
    render(<RecentWorkoutsSection recent={recent} onSeeAll={onSeeAll} />);
    expect(screen.getByText("Ноги")).toBeDefined();
    expect(screen.getByText("Спина")).toBeDefined();
    expect(screen.getByText("850 кг")).toBeDefined();
    // 90 min → 1 год 30 хв
    expect(screen.getByText(/1 год 30 хв/)).toBeDefined();
    expect(screen.getByText("1,5 т")).toBeDefined();
  });

  it("uses '—' placeholders when duration or tonnage is zero/invalid", () => {
    const onSeeAll = vi.fn();
    const recent = [row({ durationSec: 0, tonnageKg: 0 })];
    render(<RecentWorkoutsSection recent={recent} onSeeAll={onSeeAll} />);
    // Tonnage renders in its own span → getByText finds it directly.
    expect(screen.getByText("—")).toBeDefined();
    // Duration is inside a joined "{date} · —" sentence; match via regex.
    expect(screen.getByText(/·\s*—$/)).toBeDefined();
  });

  it("invokes onSeeAll when the 'Усі' pill is clicked", () => {
    const onSeeAll = vi.fn();
    render(<RecentWorkoutsSection recent={[row()]} onSeeAll={onSeeAll} />);
    const btn = screen.getByLabelText("Усі тренування");
    fireEvent.click(btn);
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});
