/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const mockUseActive = vi.hoisted(() => vi.fn<() => string | null>());
vi.mock("@shared/hooks/useActiveFizrukWorkout", () => ({
  useActiveFizrukWorkout: () => mockUseActive(),
}));

const openHubModule = vi.hoisted(() => vi.fn());
vi.mock("@shared/lib/modules/hubNav", () => ({ openHubModule }));

import { ActiveWorkoutBanner } from "./ActiveWorkoutBanner";

describe("ActiveWorkoutBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActive.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when there is no active workout", () => {
    const { container } = render(<ActiveWorkoutBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when hidden even with an active workout", () => {
    mockUseActive.mockReturnValue("w-1");
    const { container } = render(<ActiveWorkoutBanner hidden />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the resume CTA when a workout is active", () => {
    mockUseActive.mockReturnValue("w-1");
    render(<ActiveWorkoutBanner />);
    expect(screen.getByText("Тренування триває")).toBeInTheDocument();
  });

  it("deep-links into the Fizruk workouts page on click", () => {
    mockUseActive.mockReturnValue("w-1");
    render(<ActiveWorkoutBanner />);
    fireEvent.click(screen.getByRole("button"));
    expect(openHubModule).toHaveBeenCalledWith("fizruk", "#workouts");
  });

  it("shows the elapsed-minutes label as the timer advances", () => {
    vi.useFakeTimers();
    mockUseActive.mockReturnValue("w-1");
    render(<ActiveWorkoutBanner />);

    expect(screen.getByText("Тренування триває")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("1 хв · Тренування триває")).toBeInTheDocument();
  });
});
