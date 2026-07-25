// @vitest-environment jsdom
/**
 * Контракт телеметрії AI-поради (Хвиля 2, W2-AI-ADVICE-EVENTS, стадія 1).
 *
 * Що саме пінимо і чому:
 * - **тіла поради в payload немає** — це головна вимога картки; `scrubPII`
 *   чистить за іменами ключів і текст поради не вирізав би (Hard Rule #21);
 * - **impression рівно один раз на advice_id** — знаменник петлі;
 * - **advice_id не є похідною від тексту** — два виклики з різним scope дають
 *   різні id, а хеш тексту заборонений контрактом.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const trackEventMock = vi.fn();

vi.mock("./analytics", () => ({
  ANALYTICS_EVENTS: {
    AI_ADVICE_SHOWN: "ai_advice_shown",
    AI_ADVICE_REACTED: "ai_advice_reacted",
  },
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import {
  ADVICE_INSTRUMENTATION_VERSION,
  adviceIdForScope,
  markAdviceShown,
  trackAdviceReaction,
  __resetAdviceTelemetry,
} from "./adviceTelemetry";

const ADVICE_TEXT =
  "Ти витратив 1 240 грн на каву цього тижня — це на 34% більше за середнє.";

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

function payloads(name: string): AdvicePayload[] {
  return trackEventMock.mock.calls
    .filter((c) => c[0] === name)
    .map((c) => c[1] as AdvicePayload);
}

describe("adviceTelemetry — ai_advice_shown", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    __resetAdviceTelemetry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("емітить показ рівно один раз на advice_id (знаменник не роздувається)", () => {
    const input = {
      adviceId: "advice-1",
      source: "coach_insight" as const,
      surface: "hub_dashboard" as const,
      chars: ADVICE_TEXT.length,
    };

    expect(markAdviceShown(input)).toBe(true);
    expect(markAdviceShown(input)).toBe(false);
    expect(markAdviceShown(input)).toBe(false);

    expect(payloads("ai_advice_shown")).toHaveLength(1);
  });

  it("кладе chars + instrumentation_version і НЕ кладе тіла поради", () => {
    markAdviceShown({
      adviceId: "advice-2",
      source: "weekly_digest",
      surface: "hub_reports",
      chars: ADVICE_TEXT.length,
    });

    const [payload] = payloads("ai_advice_shown");
    expect(payload).toMatchObject({
      advice_id: "advice-2",
      source: "weekly_digest",
      surface: "hub_reports",
      chars: ADVICE_TEXT.length,
      instrumentation_version: ADVICE_INSTRUMENTATION_VERSION,
    });
    expect(payload?.day_key).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Жодне значення payload-у не містить тексту поради — ні під очікуваним
    // ключем, ні під випадковим.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(ADVICE_TEXT);
    expect(serialized).not.toContain("каву");
  });

  it("day_key — локальний день ПРИСТРОЮ (ADR-0078), не UTC-зріз", () => {
    // 00:30 за Києвом (UTC+3 влітку) — `toISOString().slice(0,10)` дав би
    // ПОПЕРЕДНЮ добу. Пінимо, що подія їде з днем пристрою.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 0, 30, 0));

    markAdviceShown({
      adviceId: "advice-day",
      source: "coach_insight",
      surface: "hub_dashboard",
      chars: 10,
    });

    expect(payloads("ai_advice_shown")[0]?.day_key).toBe("2026-07-25");
  });

  it("ігнорує порожній advice_id — події-сироти не емітяться", () => {
    expect(
      markAdviceShown({
        adviceId: "",
        source: "coach_insight",
        surface: "hub_dashboard",
        chars: 5,
      }),
    ).toBe(false);
    expect(payloads("ai_advice_shown")).toHaveLength(0);
  });
});

describe("adviceTelemetry — ai_advice_reacted", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    __resetAdviceTelemetry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("рахує seconds_since_shown від зафіксованого показу", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T09:00:00Z"));
    markAdviceShown({
      adviceId: "advice-3",
      source: "coach_insight",
      surface: "hub_dashboard",
      chars: 42,
    });

    vi.setSystemTime(new Date("2026-07-25T09:00:12Z"));
    expect(trackAdviceReaction("advice-3", "ask_ai")).toBe(true);

    expect(payloads("ai_advice_reacted")[0]).toEqual({
      advice_id: "advice-3",
      reaction: "ask_ai",
      seconds_since_shown: 12,
    });
  });

  it("віддає seconds_since_shown = 0, коли показу ще не було (кейс expand)", () => {
    expect(trackAdviceReaction("advice-4", "expand")).toBe(true);
    expect(payloads("ai_advice_reacted")[0]).toEqual({
      advice_id: "advice-4",
      reaction: "expand",
      seconds_since_shown: 0,
    });
  });

  it("без advice_id не емітить нічого", () => {
    expect(trackAdviceReaction(null, "refresh")).toBe(false);
    expect(trackAdviceReaction(undefined, "collapse")).toBe(false);
    expect(trackAdviceReaction("", "refresh")).toBe(false);
    expect(payloads("ai_advice_reacted")).toHaveLength(0);
  });
});

describe("adviceTelemetry — adviceIdForScope", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    __resetAdviceTelemetry();
  });

  it("стабільний у межах завантаження сторінки і різний для різних scope", () => {
    const a1 = adviceIdForScope("weekly_digest:2026-W30:2026-07-25T06:00:00Z");
    const a2 = adviceIdForScope("weekly_digest:2026-W30:2026-07-25T06:00:00Z");
    const b = adviceIdForScope("weekly_digest:2026-W31:2026-08-01T06:00:00Z");

    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("id не є похідною від тексту поради (той самий текст → різні id)", () => {
    __resetAdviceTelemetry();
    const first = adviceIdForScope(`scope:${ADVICE_TEXT}`);
    __resetAdviceTelemetry();
    const second = adviceIdForScope(`scope:${ADVICE_TEXT}`);
    expect(first).not.toBe(second);
  });
});
