/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { pluralDays } from "@sergeant/shared";
import { StreakFlame, StreakBadge } from "./StreakFlame";

afterEach(cleanup);

/** Той самий підпис, що будує компонент: «Серія: 7 днів». */
const label = (n: number) => `Серія: ${n} ${pluralDays(n)}`;

describe("StreakFlame", () => {
  it("renders a muted/dimmed flame for streak<=0", () => {
    const { getByLabelText } = render(<StreakFlame streak={0} />);
    const el = getByLabelText(label(0));
    expect(el.className).toContain("opacity-40");
    expect(el.className).toContain("text-muted");
  });

  it("renders negative streaks through the same <=0 branch", () => {
    const { getByLabelText } = render(<StreakFlame streak={-3} />);
    expect(getByLabelText(label(-3))).toBeInTheDocument();
  });

  // Драбина «жару» — тем-залежні токени `--c-streak-tier-*` (цикл 4).
  // Тест пінить МАПУ серія→щабель, а не конкретні кольори: тон обирає
  // тема (light зсунуто вниз заради 3:1 на кремі, dark лишився світлим).
  // До циклу 3 тут ротувалися пʼять ЧУЖИХ hue (yellow → amber → orange →
  // red → pink → violet), яких немає в палітрі Sergeant.
  it.each([
    [1, "text-muted"],
    [3, "text-streak-3"],
    [7, "text-streak-7"],
    [14, "text-streak-14"],
    [30, "text-streak-30"],
    [60, "text-streak-60"],
    [100, "text-streak-100"],
  ] as const)("streak=%i maps to intensity color %s", (streak, color) => {
    const { getByLabelText } = render(<StreakFlame streak={streak} />);
    const el = getByLabelText(label(streak));
    const inner = el.querySelector("span")!;
    expect(inner.className).toContain(color);
  });

  it("applies the glow animation only once streak>=7", () => {
    const { getByLabelText, rerender } = render(<StreakFlame streak={5} />);
    let inner = getByLabelText(label(5)).querySelector("span")!;
    expect(inner.className).not.toContain("animate-streak-glow");

    rerender(<StreakFlame streak={7} />);
    inner = getByLabelText(label(7)).querySelector("span")!;
    expect(inner.className).toContain("animate-streak-glow");
  });

  it("celebrates milestone streaks with the celebration animation", () => {
    const { getByLabelText } = render(<StreakFlame streak={14} />);
    const inner = getByLabelText(label(14)).querySelector("span")!;
    expect(inner.className).toContain("animate-celebration-pop");
  });

  it("does not celebrate a non-milestone streak", () => {
    const { getByLabelText } = render(<StreakFlame streak={15} />);
    const inner = getByLabelText(label(15)).querySelector("span")!;
    expect(inner.className).not.toContain("animate-celebration-pop");
  });

  it("suppresses milestone celebration when showMilestone=false", () => {
    const { getByLabelText } = render(
      <StreakFlame streak={30} showMilestone={false} />,
    );
    const inner = getByLabelText(label(30)).querySelector("span")!;
    expect(inner.className).not.toContain("animate-celebration-pop");
  });

  it("does not render the numeric label by default", () => {
    const { getByLabelText } = render(<StreakFlame streak={5} />);
    expect(getByLabelText(label(5)).textContent).toBe("");
  });

  it("renders the numeric label when showLabel=true", () => {
    const { getByLabelText } = render(<StreakFlame streak={5} showLabel />);
    expect(getByLabelText(label(5)).textContent).toBe("5");
  });

  it("applies size wrapper classes", () => {
    const { getByLabelText } = render(<StreakFlame streak={5} size="lg" />);
    const inner = getByLabelText(label(5)).querySelector("span")!;
    expect(inner.className).toContain("w-12 h-12");
  });
});

describe("StreakBadge", () => {
  it("renders nothing for streak<=0", () => {
    const { container } = render(<StreakBadge streak={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the streak count with the default «днів» label", () => {
    const { getByLabelText, getByText } = render(<StreakBadge streak={5} />);
    expect(getByLabelText(label(5))).toBeInTheDocument();
    expect(getByText("5")).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    const { getByLabelText, getByText } = render(
      <StreakBadge streak={5} label="тижнів" />,
    );
    expect(getByLabelText("Серія: 5 тижнів")).toBeInTheDocument();
    expect(getByText("тижнів")).toBeInTheDocument();
  });
});

// До 2026-09-17 обидва компоненти підписувались англійським «Streak: N days»
// поза каталогом — лінт на кирилицю такого не бачить, а користувач
// скрінрідера чув. Пінимо і мову, і відмінювання: «день / дні / днів».
describe("aria-label серії — українською, з відмінюванням", () => {
  it.each([
    [1, "Серія: 1 день"],
    [3, "Серія: 3 дні"],
    [7, "Серія: 7 днів"],
    [21, "Серія: 21 день"],
    [22, "Серія: 22 дні"],
    [0, "Серія: 0 днів"],
  ] as const)("StreakFlame streak=%i → %s", (streak, expected) => {
    const { getByLabelText } = render(<StreakFlame streak={streak} />);
    expect(getByLabelText(expected)).toBeInTheDocument();
  });

  it("StreakBadge без label відмінює так само", () => {
    const { getByLabelText } = render(<StreakBadge streak={1} />);
    expect(getByLabelText("Серія: 1 день")).toBeInTheDocument();
  });

  it("жоден підпис не містить англійського «Streak»", () => {
    const { container } = render(
      <>
        <StreakFlame streak={0} />
        <StreakFlame streak={9} />
        <StreakBadge streak={9} />
      </>,
    );
    const labels = Array.from(container.querySelectorAll("[aria-label]")).map(
      (el) => el.getAttribute("aria-label"),
    );
    expect(labels).toHaveLength(3);
    for (const l of labels) expect(l).not.toMatch(/Streak|days/);
  });
});
