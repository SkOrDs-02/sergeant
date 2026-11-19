// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeeklyVolumeChart } from "./WeeklyVolumeChart";

afterEach(cleanup);

describe("WeeklyVolumeChart", () => {
  it("renders the empty-state when total volume is zero", () => {
    render(
      <WeeklyVolumeChart todayIndex={6} volumeKg={[0, 0, 0, 0, 0, 0, 0]} />,
    );
    expect(screen.getByText("Поки без обʼєму за тиждень")).toBeInTheDocument();
  });

  it("renders the empty-state for missing / malformed input", () => {
    render(<WeeklyVolumeChart todayIndex={6} />);
    expect(screen.getByText("Поки без обʼєму за тиждень")).toBeInTheDocument();
  });

  it("renders the area chart with non-zero weekly volume", () => {
    render(
      <WeeklyVolumeChart
        todayIndex={6}
        volumeKg={[100, 200, 0, 400, 0, 600, 700]}
      />,
    );
    const chart = screen.getByLabelText(
      "Графік обсягу тренувань за дні поточного тижня",
    );
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute(
      "aria-describedby",
      "fizruk-weekly-volume-summary",
    );
    expect(document.getElementById("fizruk-weekly-volume-summary")).toHaveClass(
      "sr-only",
    );
    // Day labels are present.
    expect(screen.getByText("Пн")).toBeInTheDocument();
    expect(screen.getByText("Нд")).toBeInTheDocument();
  });

  it("не малює майбутні дні тижня нулями", () => {
    // Середа: четвер-неділя ще не настали. Раніше лінія падала в 0 після
    // сьогодні й читалась як провал обʼєму (скрин /fizruk/progress,
    // 2026-11-17). Точок рівно стільки, скільки днів уже минуло.
    const { container } = render(
      <WeeklyVolumeChart
        volumeKg={[100, 200, 300, 0, 0, 0, 0]}
        todayIndex={2}
      />,
    );
    expect(container.querySelectorAll("svg circle")).toHaveLength(3);
    // Підписи осі лишаються на весь тиждень — видно, скільки ще попереду.
    expect(screen.getByText("Нд")).toBeInTheDocument();
    const summary = document.getElementById("fizruk-weekly-volume-summary");
    expect(summary?.textContent).not.toMatch(/Чт:/);
  });

  // PR-Z3 (аудит 2026-09-13, хвиля 6; ревізія 2026-11-17): тижневий обʼєм
  // це сума вага × повтори. Легенда й опис для скрінрідера мусять казати
  // «кг×повт», а не «кг»: інакше 700 читається як 700 кілограмів.
  it("labels the volume in кг×повт in the legend and the sr summary", () => {
    render(
      <WeeklyVolumeChart
        todayIndex={6}
        volumeKg={[100, 200, 0, 400, 0, 600, 700]}
      />,
    );
    expect(screen.getByText("кг×повт")).toBeInTheDocument();
    const summary = document.getElementById("fizruk-weekly-volume-summary");
    expect(summary?.textContent).toMatch(/кг×повт/);
    expect(summary?.textContent).not.toMatch(/\d кг(?!×)/);
  });

  it("formats large y-axis values with a k suffix", () => {
    render(
      <WeeklyVolumeChart todayIndex={6} volumeKg={[2000, 0, 0, 0, 0, 0, 0]} />,
    );
    // max = 2000 → верхня поділка українською, не англійське «2.0k»
    // (браузерне QA 2026-08-23).
    expect(screen.getByText("2 тис.")).toBeInTheDocument();
    expect(screen.queryByText("2.0k")).toBeNull();
  });

  // П1 — cold-start regression: `volumeKg={[0,...]}` is indistinguishable
  // from "still loading" unless the host explicitly says so via `isLoading`.
  it("renders a skeleton instead of the empty-state while isLoading", () => {
    render(
      <WeeklyVolumeChart
        todayIndex={6}
        volumeKg={[0, 0, 0, 0, 0, 0, 0]}
        isLoading
      />,
    );
    expect(
      screen.queryByText("Поки без обʼєму за тиждень"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty-state (not a skeleton) once isLoading resolves to false with no volume", () => {
    render(
      <WeeklyVolumeChart
        todayIndex={6}
        volumeKg={[0, 0, 0, 0, 0, 0, 0]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Поки без обʼєму за тиждень")).toBeInTheDocument();
  });

  it("не глушить вертикальний скрол сторінки пальцем по графіку", () => {
    // Незакритий хвіст фіксу #3: `MiniLineChart` перевели на `touch-pan-y`
    // і закріпили тестом, а цей графік лишився на `touch-none` — тобто
    // палець на ньому не міг прокрутити сторінку (аудит 2026-09-16, WF-8).
    render(
      <WeeklyVolumeChart
        todayIndex={6}
        volumeKg={[100, 200, 0, 400, 0, 600, 700]}
      />,
    );
    const chart = screen.getByLabelText(
      "Графік обсягу тренувань за дні поточного тижня",
    );
    expect(chart).toHaveClass("touch-pan-y");
    expect(chart).not.toHaveClass("touch-none");
  });
});
