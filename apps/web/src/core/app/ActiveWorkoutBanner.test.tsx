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

// PR-Z2: the elapsed-minutes label reads `workout.startedAt` from the warm
// Fizruk SQLite cache, not the mount time of the banner — mocked here so a
// test can plant a `startedAt` far in the past without waiting real time.
const mockGetCachedFizrukSqliteState = vi.hoisted(() => vi.fn());
vi.mock("@fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => mockGetCachedFizrukSqliteState(),
}));
vi.mock("@fizruk/lib/sqliteReadGate", () => ({
  useFizrukSqliteReadTick: () => 0,
}));

import { ActiveWorkoutBanner } from "./ActiveWorkoutBanner";

describe("ActiveWorkoutBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActive.mockReturnValue(null);
    mockGetCachedFizrukSqliteState.mockReturnValue({
      workouts: [],
      refreshedAt: new Date().toISOString(),
    });
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

  it("deep-links into the active Fizruk workout on click", () => {
    mockUseActive.mockReturnValue("w-1");
    render(<ActiveWorkoutBanner />);
    fireEvent.click(screen.getByRole("button"));
    expect(openHubModule).toHaveBeenCalledWith("fizruk", "#workout/w-1");
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

  // PR-Z2 (аудит 2026-09-13, хвиля 6): регресія — `useState(() => Date.now())`
  // рахував від моменту монтування банера, не від `workout.startedAt`, тож
  // 50-хвилинне тренування показувало «1 хв» одразу після повернення на
  // хаб (банер живе у двох окремих точках дерева — `HubHomeView` і
  // `ModuleShell` — і перехід між ними знищує один інстанс і монтує інший).
  it("shows elapsed time computed from workout.startedAt immediately, not from banner mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:50:00.000Z"));
    mockUseActive.mockReturnValue("w-1");
    mockGetCachedFizrukSqliteState.mockReturnValue({
      workouts: [
        { id: "w-1", startedAt: "2026-09-13T12:00:00.000Z", endedAt: null },
      ],
      refreshedAt: new Date().toISOString(),
    });

    render(<ActiveWorkoutBanner />);

    // 50 хв уже минуло — жодного `advanceTimersByTime` не знадобилось.
    expect(screen.getByText("50 хв · Тренування триває")).toBeInTheDocument();
  });

  it("keeps the real elapsed time across a remount — returning to the hub must not reset the counter to 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:50:00.000Z"));
    mockUseActive.mockReturnValue("w-1");
    mockGetCachedFizrukSqliteState.mockReturnValue({
      workouts: [
        { id: "w-1", startedAt: "2026-09-13T12:00:00.000Z", endedAt: null },
      ],
      refreshedAt: new Date().toISOString(),
    });

    const { unmount } = render(<ActiveWorkoutBanner />);
    expect(screen.getByText("50 хв · Тренування триває")).toBeInTheDocument();

    // Simulates leaving the module (this instance is `ModuleShell`'s) and
    // arriving on the hub, where `HubHomeView` mounts a brand-new
    // `ActiveWorkoutBanner` instance 10 real minutes later.
    unmount();
    vi.setSystemTime(new Date("2026-09-13T13:00:00.000Z"));
    render(<ActiveWorkoutBanner />);

    expect(screen.getByText("60 хв · Тренування триває")).toBeInTheDocument();
  });
});
