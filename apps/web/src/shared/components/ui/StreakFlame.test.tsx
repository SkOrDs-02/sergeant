/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StreakFlame, StreakBadge } from "./StreakFlame";

afterEach(cleanup);

describe("StreakFlame", () => {
  it("renders a muted/dimmed flame for streak<=0", () => {
    const { getByLabelText } = render(<StreakFlame streak={0} />);
    const el = getByLabelText("Streak: 0 days");
    expect(el.className).toContain("opacity-40");
    expect(el.className).toContain("text-muted");
  });

  it("renders negative streaks through the same <=0 branch", () => {
    const { getByLabelText } = render(<StreakFlame streak={-3} />);
    expect(getByLabelText("Streak: -3 days")).toBeInTheDocument();
  });

  // Драбина «жару» — одна бренд-родина coral від блідого до насиченого,
  // плюс celebration-токен на сотій добі. До циклу 3 дизайн-аудиту тут
  // ротувалися п'ять ЧУЖИХ hue (yellow → amber → orange → red → pink →
  // violet), яких немає в палітрі Sergeant.
  it.each([
    [1, "text-muted"],
    [3, "text-coral-300"],
    [7, "text-coral-400"],
    [14, "text-coral-500"],
    [30, "text-coral-600"],
    [60, "text-coral-700"],
    [100, "text-celebration"],
  ] as const)("streak=%i maps to intensity color %s", (streak, color) => {
    const { getByLabelText } = render(<StreakFlame streak={streak} />);
    const el = getByLabelText(`Streak: ${streak} days`);
    const inner = el.querySelector("span")!;
    expect(inner.className).toContain(color);
  });

  it("applies the glow animation only once streak>=7", () => {
    const { getByLabelText, rerender } = render(<StreakFlame streak={5} />);
    let inner = getByLabelText("Streak: 5 days").querySelector("span")!;
    expect(inner.className).not.toContain("animate-streak-glow");

    rerender(<StreakFlame streak={7} />);
    inner = getByLabelText("Streak: 7 days").querySelector("span")!;
    expect(inner.className).toContain("animate-streak-glow");
  });

  it("celebrates milestone streaks with the celebration animation", () => {
    const { getByLabelText } = render(<StreakFlame streak={14} />);
    const inner = getByLabelText("Streak: 14 days").querySelector("span")!;
    expect(inner.className).toContain("animate-celebration-pop");
  });

  it("does not celebrate a non-milestone streak", () => {
    const { getByLabelText } = render(<StreakFlame streak={15} />);
    const inner = getByLabelText("Streak: 15 days").querySelector("span")!;
    expect(inner.className).not.toContain("animate-celebration-pop");
  });

  it("suppresses milestone celebration when showMilestone=false", () => {
    const { getByLabelText } = render(
      <StreakFlame streak={30} showMilestone={false} />,
    );
    const inner = getByLabelText("Streak: 30 days").querySelector("span")!;
    expect(inner.className).not.toContain("animate-celebration-pop");
  });

  it("does not render the numeric label by default", () => {
    const { getByLabelText } = render(<StreakFlame streak={5} />);
    expect(getByLabelText("Streak: 5 days").textContent).toBe("");
  });

  it("renders the numeric label when showLabel=true", () => {
    const { getByLabelText } = render(<StreakFlame streak={5} showLabel />);
    expect(getByLabelText("Streak: 5 days").textContent).toBe("5");
  });

  it("applies size wrapper classes", () => {
    const { getByLabelText } = render(<StreakFlame streak={5} size="lg" />);
    const inner = getByLabelText("Streak: 5 days").querySelector("span")!;
    expect(inner.className).toContain("w-12 h-12");
  });
});

describe("StreakBadge", () => {
  it("renders nothing for streak<=0", () => {
    const { container } = render(<StreakBadge streak={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the streak count with the default 'days' label", () => {
    const { getByLabelText, getByText } = render(<StreakBadge streak={5} />);
    expect(getByLabelText("Streak: 5 days")).toBeInTheDocument();
    expect(getByText("5")).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    const { getByLabelText, getByText } = render(
      <StreakBadge streak={5} label="тижнів" />,
    );
    expect(getByLabelText("Streak: 5 тижнів")).toBeInTheDocument();
    expect(getByText("тижнів")).toBeInTheDocument();
  });
});
