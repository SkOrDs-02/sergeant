// @vitest-environment jsdom
/**
 * Unit tests for `WaterHistorySheet`. `referenceMs`/"today" for the domain
 * math is pinned by mocking `Date.now` at the top of each test — the sheet
 * itself calls `todayISODate()` (device-local, ADR-0078; no explicit
 * `referenceMs`), so it always resolves "today" against the real clock.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WaterHistorySheet } from "./WaterHistorySheet";

// 2025-06-18 12:00 Kyiv (UTC+3) = 2025-06-18 09:00 UTC.
const FIXED_NOW = Date.UTC(2025, 5, 18, 9, 0, 0);

afterEach(() => {
  vi.useRealTimers();
});

describe("WaterHistorySheet", () => {
  it("renders empty state when the log has no data", () => {
    render(
      <WaterHistorySheet open onClose={() => {}} log={{}} goalMl={2000} />,
    );
    expect(screen.getByText("Поки немає історії")).toBeInTheDocument();
  });

  it("renders averages, streak and the day list when data exists", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    render(
      <WaterHistorySheet
        open
        onClose={() => {}}
        log={{ "2025-06-18": 2000, "2025-06-17": 2100 }}
        goalMl={2000}
      />,
    );
    expect(screen.getByText("Середнє за 7 днів")).toBeInTheDocument();
    expect(screen.getByText("Середнє за 30 днів")).toBeInTheDocument();
    expect(screen.getByText("Серія з ціллю")).toBeInTheDocument();
    expect(screen.getByText("2 дн.")).toBeInTheDocument();
    expect(screen.getByText("Сьогодні")).toBeInTheDocument();
    expect(screen.getByText("Вчора")).toBeInTheDocument();
  });

  it("hides the streak stat when no goal is set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    render(
      <WaterHistorySheet
        open
        onClose={() => {}}
        log={{ "2025-06-18": 500 }}
        goalMl={0}
      />,
    );
    expect(screen.queryByText("Серія з ціллю")).not.toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <WaterHistorySheet
        open={false}
        onClose={() => {}}
        log={{}}
        goalMl={2000}
      />,
    );
    expect(screen.queryByText("Історія води")).not.toBeInTheDocument();
  });
});
