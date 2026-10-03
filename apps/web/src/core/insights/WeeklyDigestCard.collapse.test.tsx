// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// `WeeklyDigestCard` reads from a TanStack-Query hook + a digest-history
// hook + (when expanded) renders the stories overlay. None of that is
// relevant to the collapse contract being tested here, so we stub all
// three at the module boundary.
vi.mock("./useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({
    digest: null,
    loading: false,
    error: null,
    weekRange: "10 — 16 листоп.",
    generate: vi.fn(),
    isCurrentWeek: true,
  }),
  useDigestHistory: () => ({ data: [] }),
  getWeekKey: () => "2025-W46",
  // Картка читає coverage окремо від тіла звіту (аудит nutrition § E-4):
  // `summary` пише модель, а «залоговано N/7» мусить лишитись фактом.
  aggregateNutrition: () => null,
}));

vi.mock("./WeeklyDigestStories", () => ({
  WeeklyDigestStories: () => null,
}));

import { WeeklyDigestCard } from "./WeeklyDigestCard";

describe("WeeklyDigestCard — collapse contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT render the collapse control when `onCollapse` is omitted", () => {
    render(<WeeklyDigestCard />);
    expect(
      screen.queryByRole("button", { name: /згорнути звіт тижня/i }),
    ).toBeNull();
  });

  it("renders the collapse control when `onCollapse` is provided and invokes it on click", () => {
    const onCollapse = vi.fn();
    render(<WeeklyDigestCard onCollapse={onCollapse} />);

    const button = screen.getByRole("button", {
      name: /згорнути звіт тижня/i,
    });
    expect(button).not.toBeNull();

    fireEvent.click(button);
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});
