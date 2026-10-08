// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const announce = vi.fn();

vi.mock("@shared/components/ui/ScreenReaderAnnouncer", () => ({
  useAnnounce: () => ({ announce }),
}));

import { ActiveState } from "./HeroCardStates";

describe("ActiveState — одноразове оголошення старту", () => {
  beforeEach(() => {
    announce.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:20:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("оголошує тривалість рівно раз, попри щосекундні тіки elapsedSec і ре-рендери", () => {
    const props = {
      state: {
        kind: "active" as const,
        startedAtIso: "2026-04-23T12:14:25Z",
      },
      kicker: {
        today: "середа, 23 квітня",
        streakWeeks: 0,
        weeklyWorkoutsCount: 0,
      },
      onResume: vi.fn(),
    };
    const { rerender } = render(<ActiveState {...props} />);
    expect(announce).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender(<ActiveState {...props} />);
    expect(announce).toHaveBeenCalledTimes(1);
  });
});
