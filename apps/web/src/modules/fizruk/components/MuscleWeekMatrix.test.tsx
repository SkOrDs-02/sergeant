// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Вид перевіряється на двох речах, які легко зламати мовчки: поріг мовчання
 * (з одним тижнем даних тренду немає, тож матриці бути не повинно) і те, що
 * тиждень відпочинку лишається порожнім стовпчиком, а не отримує мінімальну
 * висоту нарівні з крихітним обʼємом.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MuscleVolumeBlock } from "./MuscleWeekMatrix";
import type { MuscleWeekMatrix } from "../lib/muscleWeekMatrix";

function matrix(
  weekly: number[],
  weeksWithData: number,
  label = "Груди",
): MuscleWeekMatrix {
  return {
    weekStarts: [1, 2, 3, 4],
    rows: [
      {
        id: "chest",
        label,
        weekly,
        latest: weekly[3] ?? 0,
        total: weekly.reduce((s, v) => s + v, 0),
      },
    ],
    max: Math.max(...weekly, 1),
    weeksWithData,
  };
}

describe("MuscleVolumeBlock", () => {
  it("під порогом мовчання показує смугу останнього тижня, не матрицю", () => {
    render(<MuscleVolumeBlock matrix={matrix([0, 0, 0, 2], 1)} />);
    expect(screen.queryByRole("group", { name: /Обʼєм по мʼязах/ })).toBeNull();
    expect(screen.getByText("Груди")).toBeInTheDocument();
  });

  it("від двох тижнів показує матрицю з підписом напрямку осі", () => {
    render(<MuscleVolumeBlock matrix={matrix([1, 0, 2, 4], 3)} />);
    expect(
      screen.getByRole("group", { name: /Обʼєм по мʼязах/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/зліва направо/)).toBeInTheDocument();
  });

  it("озвучує тиждень відпочинку словом, а не нулем у списку чисел", () => {
    const { container } = render(
      <MuscleVolumeBlock matrix={matrix([1, 0, 2, 4], 3)} />,
    );
    const spoken = container.querySelector(".sr-only");
    expect(spoken?.textContent).toContain("нуль");
    expect(spoken?.textContent).toContain("Цього тижня: 4.0");
  });

  it("порожній тиждень має нульову висоту, а не мінімальну", () => {
    const { container } = render(
      <MuscleVolumeBlock matrix={matrix([1, 0, 2, 4], 3)} />,
    );
    const heights = [...container.querySelectorAll<HTMLElement>("[style]")].map(
      (el) => el.style.height,
    );
    // Другий стовпчик — тиждень без тренувань.
    expect(heights[1]).toBe("0%");
    expect(heights[0]).not.toBe("0%");
  });
});
