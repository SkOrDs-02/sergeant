// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { DashboardKpis } from "@sergeant/fizruk-domain/domain";
import type { MuscleState } from "@sergeant/fizruk-domain";

import { StatusStrip } from "./StatusStrip";

afterEach(() => {
  cleanup();
});

function makeKpis(overrides: Partial<DashboardKpis> = {}): DashboardKpis {
  return {
    streakDays: 0,
    streakWeeks: 0,
    streakTargetPerWeek: 2,
    currentWeekWorkouts: 0,
    currentWeekPending: false,
    weeklyWorkoutsCount: 0,
    weeklyVolumeKg: 0,
    totalCompletedCount: 0,
    avgDurationSec: 0,
    latestWorkoutIso: null,
    weightChangeKg: null,
    weightWindowDays: 30,
    ...overrides,
  };
}

function makeMuscle(
  overrides: Partial<Pick<MuscleState, "id" | "label" | "status">> = {},
): Pick<MuscleState, "id" | "label" | "status"> {
  return {
    id: "chest",
    label: "Груди",
    status: "red",
    ...overrides,
  };
}

describe("StatusStrip", () => {
  /**
   * Підпис чипа йде ПІСЛЯ значення — чип читають заради числа, а не заради
   * слова. Перевіряємо порядок у DOM, а не наявність: до цієї зміни обидва
   * вузли теж були, просто в зворотному порядку.
   */
  it("puts each chip caption after its value, not before", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const value = screen.getByText("ОК");
    const caption = screen.getByText("Готовність");
    expect(
      value.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders Готовність as ОК when no muscles are flagged for avoidance", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("ОК");
    expect(node.className).toContain("text-success");
  });

  it("names the single fatigued muscle group when exactly one is avoided", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{ avoid: [makeMuscle({ label: "Груди" })] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("Груди втомлені");
    expect(node.className).toContain("text-danger");
  });

  /**
   * V-4 audit fix: `pluralUa`'s full "3 групи втомлені" sentence (16+
   * chars) got silently cut off by the chip's `truncate` on a 390px
   * viewport ("4 групи вто…"). The chip face must now show the short
   * "Втомлені: N" form — this test pins the exact compact text so a
   * future regression back to the full sentence fails loudly, rather
   * than passing because jsdom (unlike a real browser) doesn't lay out
   * CSS width and can't itself detect the visual clipping.
   */
  it("shows a compact readiness value when several muscle groups are fatigued (V-4)", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{
          avoid: [
            makeMuscle({ id: "chest", label: "Груди" }),
            makeMuscle({ id: "back", label: "Спина" }),
            makeMuscle({ id: "legs", label: "Ноги" }),
          ],
        }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const value = screen.getByText("Втомлені: 3");
    expect(value).toBeDefined();
    // Guards the underlying defect directly: the full sentence is far
    // longer than what a quarter of a 390px strip can render without
    // ellipsis-clipping (audit measured the break around 16 chars).
    expect(value.textContent?.length).toBeLessThanOrEqual(12);
    // Full sentence must still be reachable — accessible name (screen
    // readers) and hover title (sighted mouse users) both carry it.
    const chip = screen.getByLabelText(/Готовність: 3 групи втомлені/);
    expect(chip).toHaveAttribute(
      "title",
      expect.stringContaining("3 групи втомлені"),
    );
  });

  it("формує ТИЖНЕВИЙ стрік з українською плюралізацією", () => {
    const { rerender } = render(
      <StatusStrip
        kpis={makeKpis({ streakWeeks: 1 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("1 тиждень")).toBeDefined();
    rerender(
      <StatusStrip
        kpis={makeKpis({ streakWeeks: 3 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("3 тижні")).toBeDefined();
    rerender(
      <StatusStrip
        kpis={makeKpis({ streakWeeks: 11 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("11 тижнів")).toBeDefined();
  });

  it("незакритий тиждень показує прогрес до порогу, а не нуль", () => {
    // Головна відмінність від щоденної логіки: людина, що тренувалась раз
    // цього тижня, бачить «1 з 2 цього тижня», а не «0» через відпочинок.
    render(
      <StatusStrip
        kpis={makeKpis({
          streakWeeks: 0,
          currentWeekWorkouts: 1,
          currentWeekPending: true,
        })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("1 з 2 цього тижня")).toBeDefined();
  });

  it("щоденний `streakDays` на веб-поверхню більше не потрапляє", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ streakDays: 7, streakWeeks: 0 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.queryByText("7 днів")).toBeNull();
    expect(screen.getByText("0 тижнів")).toBeDefined();
  });

  it("formats the weekly workouts count with Ukrainian pluralisation", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weeklyWorkoutsCount: 2 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("2 тренування")).toBeDefined();
  });

  it("hides the weight chip when no measurements are available", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: null })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.queryByText(/Вага · /)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("renders the weight chip with success tone for a weight loss", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: -1.4 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("−1,4 кг");
    expect(node.className).toContain("text-success");
  });

  it("renders the weight chip with danger tone for a weight gain", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: 2 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("+2 кг");
    expect(node.className).toContain("text-danger");
  });

  it("routes each chip to its matching tab", () => {
    const onOpenBody = vi.fn();
    const onOpenProgress = vi.fn();
    const onOpenWorkouts = vi.fn();
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: -0.5 })}
        recovery={{ avoid: [] }}
        onOpenBody={onOpenBody}
        onOpenProgress={onOpenProgress}
        onOpenWorkouts={onOpenWorkouts}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Готовність:/));
    fireEvent.click(screen.getByLabelText(/Серія:/));
    fireEvent.click(screen.getByLabelText(/Цей тиждень:/));
    fireEvent.click(screen.getByLabelText(/Зміна ваги/));
    expect(onOpenBody).toHaveBeenCalledTimes(2); // Готовність + Δ вага
    expect(onOpenProgress).toHaveBeenCalledTimes(1);
    expect(onOpenWorkouts).toHaveBeenCalledTimes(1);
  });
});
