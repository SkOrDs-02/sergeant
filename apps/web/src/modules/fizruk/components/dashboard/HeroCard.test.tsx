// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { HeroCard, type HeroCardState } from "./HeroCard";

/**
 * Default callback prop bag reused across tests — each test only needs
 * to override the one it's asserting on. Keeps each case focused.
 */
function makeCallbacks() {
  return {
    onResume: vi.fn(),
    onStartToday: vi.fn(),
    onOpenPlan: vi.fn(),
    onOpenTemplates: vi.fn(),
    onOpenPrograms: vi.fn(),
  };
}

function renderHero(
  state: HeroCardState,
  overrides: Record<string, unknown> = {},
) {
  const cbs = makeCallbacks();
  const utils = render(
    <HeroCard
      state={state}
      greeting="Доброго дня"
      today="середа, 23 квітня"
      {...cbs}
      {...overrides}
    />,
  );
  return { ...utils, ...cbs };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HeroCard · active state", () => {
  beforeEach(() => {
    // Freeze the clock so `diffSecFromNow` returns a deterministic elapsed
    // value no matter when the test runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:15:30Z"));
  });

  it("renders the localized kicker, live elapsed timer and 'Продовжити' CTA", () => {
    const { onResume } = renderHero({
      kind: "active",
      // 65 seconds before the frozen 'now' → expect "1:05".
      startedAtIso: "2026-04-23T12:14:25Z",
      itemsCount: 3,
    });

    expect(screen.getByText(/Доброго дня/i)).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText(/Тренування триває/i)).toBeInTheDocument();
    expect(screen.getByText(/3 вправи у сесії/i)).toBeInTheDocument();

    const resumeBtn = screen.getByLabelText(
      /Повернутись до активного тренування/i,
    );
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("formats the elapsed timer as H:MM:SS past the hour mark", () => {
    // 65 minutes + 7 seconds before the frozen 'now' → "1:05:07".
    renderHero({
      kind: "active",
      startedAtIso: "2026-04-23T11:10:23Z",
    });
    expect(screen.getByText("1:05:07")).toBeInTheDocument();
  });

  it("shows a generic fallback when itemsCount is zero / missing", () => {
    renderHero({
      kind: "active",
      startedAtIso: "2026-04-23T12:14:25Z",
      itemsCount: 0,
    });
    expect(
      screen.getByText(/Сесія відкрита — підходи й таймер чекають/i),
    ).toBeInTheDocument();
  });

  it("falls back to 0:00 for an unparseable startedAt", () => {
    renderHero({
      kind: "active",
      startedAtIso: "not-a-date",
    });
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});

describe("HeroCard · today state", () => {
  it("renders the template name, meta and 'Почати' CTA", () => {
    const { onStartToday } = renderHero({
      kind: "today",
      label: "Push A",
      exerciseCount: 6,
      estimatedMin: 45,
      hint: "З місячного плану",
    });

    expect(screen.getByText(/Сьогоднішнє тренування/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Push A" })).toBeInTheDocument();
    expect(
      screen.getByText(/6 вправ · ~45 хв · З місячного плану/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Почати тренування: Push A/i));
    expect(onStartToday).toHaveBeenCalledTimes(1);
  });

  it("omits estimate and hint parts when not provided", () => {
    renderHero({
      kind: "today",
      label: "Legs",
      exerciseCount: 5,
    });
    // Only "5 вправ" should appear in the meta line — no " · ".
    const meta = screen.getByText(/^5 вправ$/i);
    expect(meta).toBeInTheDocument();
  });
});

describe("HeroCard · upcoming state", () => {
  it("renders days-away + date and wires the 'Відкрити план' CTA", () => {
    const { onOpenPlan } = renderHero({
      kind: "upcoming",
      label: "Push B",
      daysFromNow: 2,
      dateKey: "2026-04-25",
      exerciseCount: 5,
    });

    expect(screen.getByText(/Наступне тренування/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Push B" })).toBeInTheDocument();
    expect(screen.getByText(/За 2 дні/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Відкрити план/i }));
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it("pluralises days-away correctly (Ukrainian)", () => {
    renderHero({
      kind: "upcoming",
      label: "X",
      daysFromNow: 5,
      dateKey: "2026-05-01",
      exerciseCount: null,
    });
    expect(screen.getByText(/За 5 днів/i)).toBeInTheDocument();
    cleanup();

    renderHero({
      kind: "upcoming",
      label: "Y",
      daysFromNow: 1,
      dateKey: "2026-04-24",
      exerciseCount: null,
    });
    expect(screen.getByText(/Завтра/i)).toBeInTheDocument();
    cleanup();

    renderHero({
      kind: "upcoming",
      label: "Z",
      daysFromNow: 21,
      dateKey: "2026-05-14",
      exerciseCount: null,
    });
    expect(screen.getByText(/За 21 день/i)).toBeInTheDocument();
  });

  it("hides exercise count when the catalogue doesn't know the template", () => {
    renderHero({
      kind: "upcoming",
      label: "Mystery",
      daysFromNow: 3,
      dateKey: "2026-04-26",
      exerciseCount: null,
    });
    expect(screen.queryByText(/вправ/i)).not.toBeInTheDocument();
  });
});

describe("HeroCard · empty state", () => {
  it("renders 'Обрати шаблон' when the user already has templates", () => {
    const { onOpenTemplates, onOpenPrograms } = renderHero({
      kind: "empty",
      hasTemplates: true,
    });

    expect(screen.getByText(/План порожній/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Обрати шаблон/i }));
    expect(onOpenTemplates).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /До програм/i }));
    expect(onOpenPrograms).toHaveBeenCalledTimes(1);
  });

  it("renders 'Створити шаблон' when the user has no templates yet", () => {
    renderHero({
      kind: "empty",
      hasTemplates: false,
    });
    expect(
      screen.getByRole("button", { name: /Створити шаблон/i }),
    ).toBeInTheDocument();
  });
});
