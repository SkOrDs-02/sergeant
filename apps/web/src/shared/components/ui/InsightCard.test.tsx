/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../../core/observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../../../core/observability/analytics")
  >("../../../core/observability/analytics");
  return { ...actual, trackEvent: vi.fn() };
});

import { computeAdviceId } from "@sergeant/insights";
import { InsightCard, __resetInsightShownGuard } from "./InsightCard";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import {
  __resetAnalyticsConsentForTests,
  setAnalyticsConsent,
} from "../../../core/observability/analyticsConsent";
import {
  readSignalContext,
  resetSignalAttribution,
} from "../../../core/observability/valueSignalAttribution";

const trackEventMock = vi.mocked(trackEvent);

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetInsightShownGuard();
  resetSignalAttribution();
  trackEventMock.mockClear();
  __resetAnalyticsConsentForTests();
  // `analyticsConsent` now defaults to `false` (deny until an
  // authenticated boot hydrates it — CodeRabbit PR #627). Every test in
  // this suite except the explicit "no consent" one below exercises the
  // hydrated/consenting state, so opt in here and let that one test
  // override with `setAnalyticsConsent(false)`.
  setAnalyticsConsent(true);
});

/** Усі виклики `trackEvent` з конкретним іменем події. */
function callsOf(eventName: string) {
  return trackEventMock.mock.calls.filter(([name]) => name === eventName);
}

describe("InsightCard", () => {
  it("renders title, subtitle and the default CTA glyph", () => {
    const { getByText } = render(
      <InsightCard
        id="finyk-coffee-limit-2026-05"
        title="Витрати на каву ↑ 34%"
        subtitle="Встановити ліміт?"
        onActivate={() => {}}
      />,
    );
    expect(getByText("Витрати на каву ↑ 34%")).toBeInTheDocument();
    expect(getByText("Встановити ліміт?")).toBeInTheDocument();
    expect(getByText("→")).toBeInTheDocument();
  });

  it("renders a custom ctaLabel", () => {
    const { getByText } = render(
      <InsightCard
        id="x"
        title="t"
        subtitle="s"
        ctaLabel="OK"
        onActivate={() => {}}
      />,
    );
    expect(getByText("OK")).toBeInTheDocument();
  });

  it("calls onActivate when the main button is pressed", () => {
    const onActivate = vi.fn();
    const { getByText } = render(
      <InsightCard id="x" title="t" subtitle="s" onActivate={onActivate} />,
    );
    fireEvent.click(getByText("t"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("dismisses and hides the card, calling onDismiss", () => {
    const onDismiss = vi.fn();
    const { getByLabelText, queryByText } = render(
      <InsightCard
        id="x"
        title="t"
        subtitle="s"
        onActivate={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(getByLabelText("Закрити пропозицію"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(queryByText("t")).toBeNull();
  });

  it("does not render at all when the id is already dismissed", () => {
    localStorage.setItem(
      "sergeant.v2.insights.dismissed",
      JSON.stringify(["already-dismissed"]),
    );
    const { container } = render(
      <InsightCard
        id="already-dismissed"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("labels the group with the title id for a11y", () => {
    const { container, getByText } = render(
      <InsightCard id="x" title="t" subtitle="s" onActivate={() => {}} />,
    );
    const group = container.querySelector('[role="group"]')!;
    const titleEl = getByText("t");
    expect(group.getAttribute("aria-labelledby")).toBe(titleEl.id);
  });
});

// ── Телеметрія петель цінності (Хвиля 2) ──────────────────────────────
//
// InsightCard — єдиний писар подій `value_signal_*` для всіх 9 сигналів
// у 4 модулях. Тести пінять три речі, кожна з яких мовчки псує знаменник
// петлі, якщо зламається: одноразовість показу, відсутність показу для
// dismissed-картки і стабільний `signal` без змінного суфікса.
describe("InsightCard — value-loop telemetry", () => {
  it("емітить value_signal_shown рівно один раз на mount", () => {
    render(
      <InsightCard
        id="finyk-coffee-limit-2026-07"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );

    const shown = callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.[1]).toEqual({
      module: "finyk",
      // Стабільний kind БЕЗ `-2026-07`: сирий id — high-cardinality
      // property, а для budget-overrun ще й categoryId (potential PII).
      signal: "finyk-coffee-limit",
      surface: "module",
    });
  });

  it("не дублює показ при повторному mount у межах сесії", () => {
    const card = (
      <InsightCard
        id="routine-todo-evening"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />
    );
    const first = render(card);
    first.unmount();
    render(card);

    // FinykInsightsBlock та інші блоки перераховують candidates на кожен
    // рендер батька — без once-guard-а тут було б 2+ і знаменник збрехав би.
    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN)).toHaveLength(1);
  });

  it("StrictMode подвійний mount не дублює показ", () => {
    render(
      <StrictMode>
        <InsightCard
          id="fizruk-pr-pending"
          title="t"
          subtitle="s"
          onActivate={() => {}}
        />
      </StrictMode>,
    );

    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN)).toHaveLength(1);
  });

  it("НЕ емітить показ для вже відкинутої картки", () => {
    // `useInsightDismissal` тримає dismissed-id у localStorage назавжди,
    // тож така картка ніколи не рендериться — і не має рахуватись показом.
    localStorage.setItem(
      "sergeant.v2.insights.dismissed",
      JSON.stringify(["nutrition-protein-low"]),
    );
    render(
      <InsightCard
        id="nutrition-protein-low"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );

    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN)).toHaveLength(0);
  });

  it("емітить value_signal_activated з коректними module/signal", () => {
    const { getByText } = render(
      <InsightCard
        id="finyk-budget-overrun-cat_9f2b1c"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    fireEvent.click(getByText("t"));

    const activated = callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_ACTIVATED);
    expect(activated).toHaveLength(1);
    expect(activated[0]?.[1]).toEqual({
      module: "finyk",
      signal: "finyk-budget-overrun",
      surface: "module",
    });
  });

  it("емітить value_signal_dismissed з коректними module/signal", () => {
    const { getByLabelText } = render(
      <InsightCard
        id="nutrition-streak-7-days-2026-W30"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    fireEvent.click(getByLabelText("Закрити пропозицію"));

    const dismissed = callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_DISMISSED);
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0]?.[1]).toEqual({
      module: "nutrition",
      signal: "nutrition-streak-7-days",
      surface: "module",
    });
  });

  it("проп surface їде у payload (хаб vs модуль)", () => {
    render(
      <InsightCard
        id="routine-streak-record-pending"
        title="t"
        subtitle="s"
        surface="hub"
        onActivate={() => {}}
      />,
    );

    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN)[0]?.[1]).toMatchObject({
      surface: "hub",
    });
  });

  it("показ кладе сигнал у леджер атрибуції", () => {
    render(
      <InsightCard
        id="routine-todo-evening"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );

    expect(readSignalContext("routine")).toMatchObject({
      after_signal: true,
      signal: "routine-todo-evening",
    });
    // Чужий модуль атрибуцію не отримує.
    expect(readSignalContext("finyk").after_signal).toBe(false);
  });

  it("відкинута картка не кладе сигнал у леджер", () => {
    localStorage.setItem(
      "sergeant.v2.insights.dismissed",
      JSON.stringify(["fizruk-rest-day-overdue"]),
    );
    render(
      <InsightCard
        id="fizruk-rest-day-overdue"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );

    expect(readSignalContext().after_signal).toBe(false);
  });
});

// ── Стабільний крос-девайсний advice_id (беta-хардненінг) ─────────────
describe("InsightCard — advice_shown / advice_dismissed telemetry", () => {
  it("емітить advice_shown поруч із value_signal_shown, з детермінованим advice_id", () => {
    render(
      <InsightCard
        id="finyk-coffee-limit-2026-07"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );

    const shown = callsOf(ANALYTICS_EVENTS.ADVICE_SHOWN);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.[1]).toEqual({
      advice_id: computeAdviceId(
        "finyk-coffee-limit",
        "finyk-coffee-limit-2026-07",
      ),
      advice_type: "finyk-coffee-limit",
      module: "finyk",
    });
  });

  it("advice_id є ідентичним для того самого id, обчислений незалежно (crypto двох 'пристроїв')", () => {
    render(
      <InsightCard
        id="routine-todo-evening"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    const shown = callsOf(ANALYTICS_EVENTS.ADVICE_SHOWN);
    const emitted = shown[0]?.[1]?.["advice_id"];
    // Ніякого спільного in-memory guard-а між цим обчисленням і компонентом —
    // computeAdviceId детермінований, тож збіг доводить крос-девайс стабільність.
    expect(emitted).toBe(
      computeAdviceId("routine-todo-evening", "routine-todo-evening"),
    );
  });

  it("не дублює advice_shown при повторному mount у межах сесії (той самий guard, що value_signal_shown)", () => {
    const card = (
      <InsightCard
        id="fizruk-pr-pending"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />
    );
    const first = render(card);
    first.unmount();
    render(card);

    expect(callsOf(ANALYTICS_EVENTS.ADVICE_SHOWN)).toHaveLength(1);
  });

  it("емітить advice_dismissed з тим самим advice_id/advice_type/module на dismiss", () => {
    const { getByLabelText } = render(
      <InsightCard
        id="nutrition-streak-7-days-2026-W30"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    fireEvent.click(getByLabelText("Закрити пропозицію"));

    const dismissed = callsOf(ANALYTICS_EVENTS.ADVICE_DISMISSED);
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0]?.[1]).toEqual({
      advice_id: computeAdviceId(
        "nutrition-streak-7-days",
        "nutrition-streak-7-days-2026-W30",
      ),
      advice_type: "nutrition-streak-7-days",
      module: "nutrition",
    });
  });

  it("клік по чипу «Спитати AI» кличе onAskAi, емітить value_signal_ask_ai і advice_reacted", () => {
    const onAskAi = vi.fn();
    const { getByLabelText } = render(
      <InsightCard
        id="nutrition-protein-low"
        title="t"
        subtitle="s"
        onActivate={() => {}}
        onAskAi={onAskAi}
      />,
    );
    fireEvent.click(getByLabelText("Спитати AI про це"));

    expect(onAskAi).toHaveBeenCalledTimes(1);
    const askAi = callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_ASK_AI);
    expect(askAi).toHaveLength(1);
    expect(askAi[0]?.[1]).toEqual({
      module: "nutrition",
      signal: "nutrition-protein-low",
      surface: "module",
    });
    const reacted = callsOf(ANALYTICS_EVENTS.AI_ADVICE_REACTED);
    expect(reacted).toHaveLength(1);
    expect(reacted[0]?.[1]).toMatchObject({
      advice_id: computeAdviceId(
        "nutrition-protein-low",
        "nutrition-protein-low",
      ),
      reaction: "ask_ai",
    });
  });

  it("дизейблений чип «Спитати AI» не кличе onAskAi і не емітить подій", () => {
    const onAskAi = vi.fn();
    const { getByLabelText } = render(
      <InsightCard
        id="nutrition-protein-low"
        title="t"
        subtitle="s"
        onActivate={() => {}}
        onAskAi={onAskAi}
        askAiDisabled
      />,
    );
    fireEvent.click(getByLabelText("Ліміт AI на сьогодні"));

    expect(onAskAi).not.toHaveBeenCalled();
    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_ASK_AI)).toHaveLength(0);
  });

  it("без onAskAi чип не рендериться", () => {
    const { queryByLabelText } = render(
      <InsightCard id="x" title="t" subtitle="s" onActivate={() => {}} />,
    );
    expect(queryByLabelText("Спитати AI про це")).toBeNull();
  });

  it("НЕ емітить advice_shown / advice_dismissed без analytics-згоди, але value_signal_* лишається неушкодженим", () => {
    setAnalyticsConsent(false);
    const { getByLabelText } = render(
      <InsightCard
        id="finyk-recurring-detected"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    fireEvent.click(getByLabelText("Закрити пропозицію"));

    expect(callsOf(ANALYTICS_EVENTS.ADVICE_SHOWN)).toHaveLength(0);
    expect(callsOf(ANALYTICS_EVENTS.ADVICE_DISMISSED)).toHaveLength(0);
    // Consent gate scoped to the two new events only — the pre-existing
    // value_signal_* pair is unaffected.
    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN)).toHaveLength(1);
    expect(callsOf(ANALYTICS_EVENTS.VALUE_SIGNAL_DISMISSED)).toHaveLength(1);
  });
});
