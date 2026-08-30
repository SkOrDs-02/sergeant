// @vitest-environment jsdom
/**
 * Телеметрія тижневого дайджесту як ДРУГОГО джерела AI-поради
 * (W2-AI-ADVICE-EVENTS, web-частина стадії 2; канон hub-coach §ж.1).
 *
 * Дайджест — теж AI-порада, тож іде тією самою парою подій із
 * `source: "weekly_digest"`; окремої метрики не заводимо.
 *
 * Ключове: тіло звіту живе ВСЕРЕДИНІ `expanded`-регіону, тож «картка на
 * екрані» ще не означає «пораду прочитали». Плюс зовнішній collapse секції.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const trackEventMock = vi.fn();

vi.mock("../observability/analytics", () => ({
  ANALYTICS_EVENTS: {
    AI_ADVICE_SHOWN: "ai_advice_shown",
    AI_ADVICE_REACTED: "ai_advice_reacted",
  },
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const generateMock = vi.fn();

const DIGEST = {
  generatedAt: "2026-07-25T06:00:00.000Z",
  finyk: {
    summary: "Витрати під контролем",
    comment: "Ти тримався бюджету всі сім днів.",
    recommendations: ["Залиш ліміт на каву як є"],
  },
  overallRecommendations: ["Продовжуй у тому ж дусі"],
};

vi.mock("./useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({
    digest: DIGEST,
    loading: false,
    error: null,
    weekRange: "20 — 26 лип.",
    generate: generateMock,
    // Див. коментар у `WeeklyDigestCard.datastate.test.tsx`: `canGenerate`
    // прийшов у контракт хука з #935 і мусить бути в моку.
    isCurrentWeek: true,
    canGenerate: true,
  }),
  useDigestHistory: () => ({ data: [] }),
  getWeekKey: () => "2026-W30",
  // Картка читає coverage окремо від тіла звіту (аудит nutrition § E-4):
  // `summary` пише модель, а «залоговано N/7» мусить лишитись фактом.
  aggregateNutrition: () => null,
}));

vi.mock("./WeeklyDigestStories", () => ({
  WeeklyDigestStories: () => null,
}));

import { WeeklyDigestCard } from "./WeeklyDigestCard";
import { __resetAdviceTelemetry } from "../observability/adviceTelemetry";

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

describe("WeeklyDigestCard — телеметрія AI-поради", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    generateMock.mockClear();
    __resetAdviceTelemetry();
  });

  afterEach(() => {
    cleanup();
  });

  it("НЕ емітить показ, поки тіло звіту згорнуте", () => {
    render(<WeeklyDigestCard />);
    expect(
      screen.getByRole("button", { name: /переглянути звіт/i }),
    ).toBeInTheDocument();
    expect(shown()).toHaveLength(0);
  });

  it("НЕ емітить показ, коли зовнішня секція згорнута", () => {
    render(<WeeklyDigestCard sectionOpen={false} />);
    fireEvent.click(screen.getByRole("button", { name: /переглянути звіт/i }));
    expect(shown()).toHaveLength(0);
  });

  it("емітить показ із source=weekly_digest, коли звіт розгорнули", () => {
    render(<WeeklyDigestCard surface="hub_dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /переглянути звіт/i }));

    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toMatchObject({
      source: "weekly_digest",
      surface: "hub_dashboard",
    });
    expect(shown()[0]?.advice_id).toBeTruthy();
    // chars — сумарна довжина AI-тексту; самого тексту в payload немає.
    expect(shown()[0]?.chars).toBeGreaterThan(0);
    const serialized = JSON.stringify(shown()[0]);
    expect(serialized).not.toContain("Ти тримався бюджету");
    expect(serialized).not.toContain("Витрати під контролем");
  });

  it("дефолтна поверхня — hub_reports (standalone-використання у «Звітах»)", () => {
    render(<WeeklyDigestCard />);
    fireEvent.click(screen.getByRole("button", { name: /переглянути звіт/i }));
    expect(shown()[0]).toMatchObject({ surface: "hub_reports" });
  });

  it("розгортання / згортання / «Оновити звіт» їдуть як expand / collapse / refresh", () => {
    render(<WeeklyDigestCard />);

    fireEvent.click(screen.getByRole("button", { name: /переглянути звіт/i }));
    fireEvent.click(screen.getByRole("button", { name: /оновити звіт/i }));
    fireEvent.click(screen.getByRole("button", { name: /^згорнути$/i }));

    expect(reacted().map((p) => p.reaction)).toEqual([
      "expand",
      "refresh",
      "collapse",
    ]);
    expect(generateMock).toHaveBeenCalledTimes(1);
    // Усі реакції привʼязані до одного й того самого advice_id.
    const ids = new Set(reacted().map((p) => p.advice_id));
    expect(ids.size).toBe(1);
    expect(ids.has(shown()[0]?.advice_id)).toBe(true);
  });

  it("хедерне згортання картки їде як collapse і не зʼїдає консюмерський колбек", () => {
    const onCollapse = vi.fn();
    render(<WeeklyDigestCard onCollapse={onCollapse} />);

    fireEvent.click(
      screen.getByRole("button", { name: /згорнути звіт тижня/i }),
    );

    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(reacted()[0]).toMatchObject({ reaction: "collapse" });
  });
});
