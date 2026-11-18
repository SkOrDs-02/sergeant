// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Шапка картки (зйомка 2026-11-18, кадр `digest-current-week-1.png`):
// заголовок «Звіт тижня» обрізало до «З…» бейджами, а дата генерації
// стояла в іншому форматі місяця, ніж діапазон тижня.
vi.mock("./useWeeklyDigest", () => ({
  useAutoDigestPending: () => false,
  useWeeklyDigest: () => ({
    digest: {
      generatedAt: "2026-11-16T09:00:00.000Z",
      weekKey: "2026-11-09",
      weekRange: "9–15 лис 2026",
      finyk: { summary: "Витрати стабільні" },
    },
    loading: false,
    error: null,
    insufficientData: false,
    weekRange: "9–15 лис 2026",
    generate: vi.fn(),
    isCurrentWeek: false,
    canGenerate: true,
  }),
  useDigestHistory: () => ({ data: [] }),
  getWeekKey: () => "2026-11-16",
  aggregateNutrition: () => null,
}));

vi.mock("./WeeklyDigestStories", () => ({
  WeeklyDigestStories: () => null,
}));

import { WeeklyDigestCard } from "./WeeklyDigestCard";

describe("WeeklyDigestCard — шапка", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T12:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("заголовок не скорочується, бейджі переносяться окремо від нього", () => {
    render(<WeeklyDigestCard />);
    const title = screen.getByText("Звіт тижня");
    expect(title.className).not.toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/\bshrink-0\b/);
    expect(screen.getByText("Новий звіт")).toBeInTheDocument();
    expect(screen.getByText("Припущення")).toBeInTheDocument();
    // Рядок із заголовком і бейджами переноситься, а не ріже заголовок.
    expect(title.parentElement?.className).toMatch(/\bflex-wrap\b/);
  });

  it("дата генерації тим самим форматом місяця, що й діапазон тижня", () => {
    render(<WeeklyDigestCard />);
    expect(screen.getByText("9–15 лис 2026")).toBeInTheDocument();
    expect(screen.getByText("16 лис")).toBeInTheDocument();
    expect(screen.queryByText(/лист\./)).toBeNull();
  });
});
