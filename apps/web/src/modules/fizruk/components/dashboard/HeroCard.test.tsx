// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";

import { HeroCard, type HeroCardState } from "./HeroCard";
import { ScreenReaderAnnouncerProvider } from "@shared/components/ui/ScreenReaderAnnouncer";
import type { HeroRecoveryRow } from "@sergeant/fizruk-domain";

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
    onOpenAtlas: vi.fn(),
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
      today="середа, 23 квітня"
      streakWeeks={0}
      weeklyWorkoutsCount={0}
      recoveryRows={[]}
      recoverByDate={{}}
      {...cbs}
      {...overrides}
    />,
  );
  return { ...utils, ...cbs };
}

const CHEST_ROW: HeroRecoveryRow = {
  atlasId: "chest",
  label: "Груди",
  kind: "muscle",
  status: "yellow",
  fatigue: 0.5,
  domainMuscleId: "pectoralis_major",
};

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

    expect(screen.getByText(/середа, 23 квітня/i)).toBeInTheDocument();
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
      screen.getByText(/Сесія відкрита, підходи й таймер чекають/i),
    ).toBeInTheDocument();
  });

  it("falls back to 0:00 for an unparseable startedAt", () => {
    renderHero({
      kind: "active",
      startedAtIso: "not-a-date",
    });
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  // A11y regression guard (fixed 2026-08-08): the elapsed-timer `<p>` used
  // to carry `aria-live="polite"` plus an `aria-label` embedding the
  // ticking `elapsedSec`, so a screen reader re-announced the elapsed
  // duration every second for the entire active session. The accessible
  // name must now stay static across ticks; only a one-time mount
  // announcement (asserted below via `ScreenReaderAnnouncerProvider`)
  // carries the duration to screen-reader users.
  it("keeps a stable role=timer aria-label across ticks — no per-second chatter", () => {
    renderHero({
      kind: "active",
      startedAtIso: "2026-04-23T12:14:25Z",
    });
    const timer = screen.getByRole("timer");
    expect(timer).not.toHaveAttribute("aria-live");
    const label = timer.getAttribute("aria-label");
    expect(label).toBeTruthy();
    expect(label).not.toMatch(/\d/); // static copy — no interpolated seconds

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(label);
  });
});

// Kept outside the `describe("HeroCard · active state", …)` block above
// on purpose: that block runs under `vi.useFakeTimers()`, and the
// `requestAnimationFrame` the shared announcer schedules internally (see
// `ScreenReaderAnnouncer.tsx`) does not reliably flush via
// `advanceTimersByTime` once a *preceding* fake-timers test has left an
// unflushed scheduling callback pending — real timers + `waitFor` sidestep
// that cross-test fake-clock interaction entirely.
describe("HeroCard · active state — screen-reader milestone announce", () => {
  it("announces the elapsed duration once via the shared live region on mount", async () => {
    const cbs = makeCallbacks();
    render(
      <ScreenReaderAnnouncerProvider>
        <HeroCard
          // `startedAtIso` = "now" so the elapsed seconds stay near 0
          // regardless of real wall-clock time when the test runs.
          state={{ kind: "active", startedAtIso: new Date().toISOString() }}
          today="середа, 23 квітня"
          streakWeeks={0}
          weeklyWorkoutsCount={0}
          recoveryRows={[]}
          recoverByDate={{}}
          {...cbs}
        />
      </ScreenReaderAnnouncerProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /^Тренування триває, 0:0[0-5]$/,
      ),
    );
  });
});

describe("HeroCard · today state", () => {
  it("names the template once — in the CTA, not as a second heading", () => {
    const { onStartToday } = renderHero({
      kind: "today",
      label: "Push A",
      exerciseCount: 6,
      estimatedMin: 45,
      hint: "З місячного плану",
    });

    // Hero відповідає на «що з тілом», а не «що в розкладі»: заголовка з
    // назвою шаблону тут немає, назва живе рівно в одному місці — у CTA.
    expect(screen.queryByRole("heading", { name: "Push A" })).toBeNull();
    expect(screen.queryByText(/Сьогоднішнє тренування/i)).toBeNull();
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

    // Тут CTA («Відкрити план») назви не несе, тож вона переїхала в голову
    // мета-рядка — заголовка немає, але з екрана вона не зникла.
    expect(screen.queryByRole("heading", { name: "Push B" })).toBeNull();
    expect(screen.getByText(/Push B · За 2 дні/i)).toBeInTheDocument();

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

// Спека `fizruk-hero-recovery-bars.md` § Рішення дизайну 1-3: рядки «стан
// тіла» рендеряться в `today`/`upcoming`/`empty`, ніколи в `active`, а
// кікер несе серію/тиждень замість колишнього тайл-рядка знизу hero.
describe("HeroCard · recovery bars + kicker", () => {
  it.each([
    ["today", { kind: "today", label: "Push A", exerciseCount: 6 }],
    [
      "upcoming",
      {
        kind: "upcoming",
        label: "Push B",
        daysFromNow: 2,
        dateKey: "2026-04-25",
        exerciseCount: 5,
      },
    ],
    ["empty", { kind: "empty", hasTemplates: true }],
  ] as const)("renders recovery rows in the %s state", (_label, state) => {
    renderHero(state, { recoveryRows: [CHEST_ROW] });
    expect(screen.getByRole("button", { name: /Груди/ })).toBeInTheDocument();
  });

  it("does not render recovery rows in the active state", () => {
    renderHero(
      { kind: "active", startedAtIso: new Date().toISOString() },
      { recoveryRows: [CHEST_ROW] },
    );
    expect(
      screen.queryByRole("button", { name: /Груди/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty-body message when there are no recovery rows", () => {
    renderHero({ kind: "empty", hasTemplates: false });
    expect(screen.getByText(/Тіло ще не має історії/)).toBeInTheDocument();
  });

  it("kicker contains the streak-weeks and weekly-workouts readout", () => {
    renderHero(
      { kind: "empty", hasTemplates: false },
      { streakWeeks: 1, weeklyWorkoutsCount: 1 },
    );
    expect(
      screen.getByText(/серія 1 тижн\. · 1 тренування/),
    ).toBeInTheDocument();
  });

  it("tapping a recovery row calls onOpenAtlas with the row's atlasId", () => {
    const { onOpenAtlas } = renderHero(
      { kind: "today", label: "Push A", exerciseCount: 6 },
      { recoveryRows: [CHEST_ROW] },
    );
    fireEvent.click(screen.getByRole("button", { name: /Груди/ }));
    expect(onOpenAtlas).toHaveBeenCalledWith("chest");
  });
});
