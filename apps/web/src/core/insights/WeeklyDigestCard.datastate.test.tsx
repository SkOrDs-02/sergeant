// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `vi.mock` is hoisted above any plain `const`, so we use `vi.hoisted` to
// share fresh `vi.fn()` instances between the mock factory and the tests.
const { useWeeklyDigestMock, useDigestHistoryMock } = vi.hoisted(() => ({
  useWeeklyDigestMock: vi.fn(),
  useDigestHistoryMock: vi.fn(),
}));

// Stub the digest-history overlay (irrelevant to the 4-state contract).
vi.mock("./WeeklyDigestStories", () => ({
  WeeklyDigestStories: () => null,
}));

vi.mock("./useWeeklyDigest", () => ({
  useWeeklyDigest: (...args: unknown[]) => useWeeklyDigestMock(...args),
  useDigestHistory: (...args: unknown[]) => useDigestHistoryMock(...args),
  getWeekKey: () => "2025-W46",
}));

import { WeeklyDigestCard } from "./WeeklyDigestCard";

describe("WeeklyDigestCard — DataState routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDigestHistoryMock.mockReturnValue({ data: [] });
  });

  // The shared apps/web vitest setup (src/test/setup.ts) does not register
  // RTL's auto-cleanup, so two `render()` calls would otherwise stack their
  // DOM trees and leak state between tests.
  afterEach(() => {
    cleanup();
  });

  it("renders the loading skeleton (`aria-busy`) while a digest is generating", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: true,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
    });

    render(<WeeklyDigestCard />);

    expect(screen.getByLabelText(/генеруємо звіт тижня/i)).toBeInTheDocument();
    // No empty/error/content affordances while skeleton is up.
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
  });

  it("renders the empty slot with a generate button on the current week when there is no digest", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByRole("button", { name: /згенерувати звіт/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/генеруємо звіт тижня/i)).toBeNull();
  });

  it("renders the empty slot with a 'not stored' message on a past week", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "03 — 09 листоп.",
      generate: vi.fn(),
      isCurrentWeek: false,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByText(/звіт за цей тиждень не збережено/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
  });

  it("renders the error slot (with retry on current week) when the mutation reports an error and loading has settled", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: "Не вдалося згенерувати",
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
    });

    render(<WeeklyDigestCard />);

    expect(screen.getByText(/не вдалося згенерувати/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /спробувати знову/i }),
    ).toBeInTheDocument();
  });

  it("renders digest content (stories button) when at least one module has data", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: {
        generatedAt: "2025-11-16T08:00:00Z",
        finyk: {
          summary: "Витрати в нормі",
          comment: null,
          recommendations: [],
        },
      },
      loading: false,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByRole("button", { name: /переглянути як сторіс/i }),
    ).toBeInTheDocument();
    // Empty/error affordances are not on screen.
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /спробувати знову/i }),
    ).toBeNull();
  });
});
