/** @vitest-environment jsdom */
/**
 * Телеметрія AI-поради на картці асистента (W2-AI-ADVICE-EVENTS, стадія 1).
 *
 * Найважливіше тут — НЕ те, що подія показу є, а те, що її НЕМА, поки текст
 * не видно. Картка сидить у подвійному collapse (зовнішня `CollapsibleSection`
 * + власний `hub_assistant_advice_collapsed`), і `CollapsibleSection` тримає
 * дітей у DOM навіть згорнутою. Impression на mount роздув би знаменник у
 * рази — і «цінність AI» вийшла б штучно низькою назавжди, бо переписати
 * історію подій неможливо.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const trackEventMock = vi.fn();

vi.mock("../observability/analytics", () => ({
  ANALYTICS_EVENTS: {
    AI_ADVICE_SHOWN: "ai_advice_shown",
    AI_ADVICE_REACTED: "ai_advice_reacted",
  },
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: vi.fn(),
}));

import { AssistantAdviceCard } from "./AssistantAdviceCard";
import { __resetAdviceTelemetry } from "../observability/adviceTelemetry";

const INSIGHT = "Ти витратив на 18% більше за середній тиждень.";
const COLLAPSED_KEY = "hub_assistant_advice_collapsed";

/** Розкладка payload-у подій — щоб у тестах читати поля крапкою. */
interface AdvicePayload {
  advice_id?: string;
  source?: string;
  surface?: string;
  day_key?: string;
  chars?: number;
  instrumentation_version?: number;
  reaction?: string;
  seconds_since_shown?: number;
}

function events(name: string): AdvicePayload[] {
  return trackEventMock.mock.calls
    .filter((c) => c[0] === name)
    .map((c) => c[1] as AdvicePayload);
}

const shown = () => events("ai_advice_shown");
const reacted = () => events("ai_advice_reacted");

describe("AssistantAdviceCard — impression лише за фактичної видимості", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    __resetAdviceTelemetry();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("НЕ емітить показ, коли зовнішня секція згорнута (картка змонтована, але невидима)", () => {
    render(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-1"
        sectionOpen={false}
      />,
    );
    expect(shown()).toHaveLength(0);
  });

  it("НЕ емітить показ, коли згорнута сама картка", () => {
    window.localStorage.setItem(COLLAPSED_KEY, "1");
    render(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-2"
        sectionOpen
      />,
    );
    expect(shown()).toHaveLength(0);
  });

  it("НЕ емітить показ, поки тексту немає (скелетон початкового завантаження)", () => {
    render(
      <AssistantAdviceCard
        insight={null}
        loading={true}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-3"
        sectionOpen
      />,
    );
    expect(shown()).toHaveLength(0);
  });

  it("емітить показ рівно один раз, коли текст реально видимий", () => {
    const { rerender } = render(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-4"
        sectionOpen
      />,
    );
    rerender(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-4"
        sectionOpen
      />,
    );

    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toMatchObject({
      advice_id: "advice-4",
      source: "coach_insight",
      surface: "hub_dashboard",
      chars: INSIGHT.length,
    });
    // Тіло поради у payload не існує — лише довжина.
    expect(JSON.stringify(shown()[0])).not.toContain(INSIGHT);
  });

  it("емітить показ після того, як зовнішня секція розгорнулась", () => {
    const { rerender } = render(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-5"
        sectionOpen={false}
      />,
    );
    expect(shown()).toHaveLength(0);

    rerender(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        adviceId="advice-5"
        sectionOpen
      />,
    );
    expect(shown()).toHaveLength(1);
  });

  it("без adviceId не емітить ані показу, ані реакцій", () => {
    render(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        sectionOpen
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /запитати ai про це/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /оновити пораду/i }));

    expect(shown()).toHaveLength(0);
    expect(reacted()).toHaveLength(0);
  });
});

describe("AssistantAdviceCard — реакції на наявних афордансах", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    __resetAdviceTelemetry();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  function renderCard(onRefresh = vi.fn()) {
    render(
      <AssistantAdviceCard
        insight={INSIGHT}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        adviceId="advice-r"
        sectionOpen
      />,
    );
  }

  it("«Запитати AI про це» → reaction: ask_ai", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: /запитати ai про це/i }),
    );

    expect(reacted()).toHaveLength(1);
    expect(reacted()[0]).toMatchObject({
      advice_id: "advice-r",
      reaction: "ask_ai",
    });
  });

  it("refresh → reaction: refresh, і консюмерський колбек усе одно викликається", () => {
    const onRefresh = vi.fn();
    renderCard(onRefresh);
    fireEvent.click(screen.getByRole("button", { name: /оновити пораду/i }));

    expect(reacted()[0]).toMatchObject({ reaction: "refresh" });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("згортання/розгортання картки → collapse / expand (нових кнопок не додано)", () => {
    renderCard();
    // Персона зведена в одну — «Сержант» (`messages.sergeant.adviceCardTitle`).
    const header = screen.getByRole("button", { name: /сержант/i });

    fireEvent.click(header); // → collapse
    fireEvent.click(header); // → expand

    expect(reacted().map((p) => p.reaction)).toEqual(["collapse", "expand"]);
    // Показ лишається одним: guard тримає (advice_id, завантаження сторінки).
    expect(shown()).toHaveLength(1);
  });
});
