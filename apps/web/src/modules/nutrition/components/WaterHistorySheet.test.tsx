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

  /**
   * Регресія: вода, залита раніше за 14-денне вікно, не показувалась
   * ніде — ані в списку, ані в графіку, — а порожній стан ще й
   * стверджував, що історії немає. 15 л за 2026-08-07 при «сьогодні»
   * 2026-08-24 — рівно той випадок із QA.
   */
  it("показує день поза 14-денним вікном замість порожнього стану", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 24, 9, 0, 0));
    render(
      <WaterHistorySheet
        open
        onClose={() => {}}
        log={{ "2026-08-07": 15000 }}
        goalMl={2000}
      />,
    );
    expect(screen.queryByText("Поки немає історії")).not.toBeInTheDocument();
    expect(screen.getByText("Раніше")).toBeInTheDocument();
    expect(screen.getByText("7 серп.")).toBeInTheDocument();
    expect(screen.getByText(/15 л/)).toBeInTheDocument();
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
