// @vitest-environment jsdom
/**
 * Контракт телеметрії тертя запису (`entry_compose_finished`, §6).
 *
 * Що саме пінимо і чому:
 * - **кинута композиція емітиться** — без `abandoned` знаменник бреше в
 *   найгірший бік: «швидко» не відрізняється від «здався»;
 * - **`ms` сирий, без порогів** — вікно «швидко» обирається у PostHog;
 * - **`backgrounded` ловить сховану вкладку** — інакше розподіл часу
 *   визначають не форми, а перерви на каву;
 * - **вмісту запису в payload немає** — лише enum-и, прапорці й тривалість
 *   (Hard Rule #21);
 * - **сирота флашиться при наступному відкритті**, а не затирається мовчки.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const trackEventMock = vi.fn();

vi.mock("./analytics", () => ({
  ANALYTICS_EVENTS: {
    ENTRY_COMPOSE_FINISHED: "entry_compose_finished",
  },
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import {
  COMPOSE_INSTRUMENTATION_VERSION,
  beginCompose,
  markComposeSaved,
  endCompose,
  __resetComposeTelemetry,
} from "./composeTelemetry";

interface ComposePayload {
  module?: string;
  entry_kind?: string;
  surface?: string;
  outcome?: string;
  ms?: number;
  backgrounded?: boolean;
  instrumentation_version?: number;
}

function lastPayload(): ComposePayload {
  const call = trackEventMock.mock.calls.at(-1);
  return (call?.[1] ?? {}) as ComposePayload;
}

const MEAL = {
  module: "nutrition",
  entryKind: "meal",
  surface: "fab",
} as const;

/** Підміняє `document.visibilityState`, який у jsdom read-only. */
function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("composeTelemetry", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    __resetComposeTelemetry();
    setVisibility("visible");
  });

  afterEach(() => {
    __resetComposeTelemetry();
    vi.useRealTimers();
  });

  it("емітить saved, коли збереження позначено до закриття", () => {
    beginCompose("nutrition:add-meal", MEAL);
    markComposeSaved("nutrition:add-meal");
    expect(endCompose("nutrition:add-meal")).toBe(true);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock.mock.calls[0]?.[0]).toBe("entry_compose_finished");
    expect(lastPayload()).toMatchObject({
      module: "nutrition",
      entry_kind: "meal",
      surface: "fab",
      outcome: "saved",
      backgrounded: false,
      instrumentation_version: COMPOSE_INSTRUMENTATION_VERSION,
    });
  });

  it("емітить abandoned, коли форму закрили без збереження", () => {
    beginCompose("nutrition:add-meal", MEAL);
    endCompose("nutrition:add-meal");

    // Головний сенс події: кинута форма — це факт, а не тиша. Без цього
    // рядка метрика мовчки хвалила б сама себе.
    expect(lastPayload().outcome).toBe("abandoned");
  });

  it("несе сиру тривалість без порогів", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
    beginCompose("fizruk:past-workout", {
      module: "fizruk",
      entryKind: "past_workout",
      surface: "journal",
    });

    // Півгодини — свідомо поза будь-яким розумним «часом запису». Подія
    // мусить полетіти все одно: поріг живе в PostHog-запиті, не в коді.
    vi.advanceTimersByTime(30 * 60 * 1000);
    markComposeSaved("fizruk:past-workout");
    endCompose("fizruk:past-workout");

    expect(lastPayload().ms).toBe(30 * 60 * 1000);
  });

  it("позначає backgrounded, коли вкладку ховали під час запису", () => {
    beginCompose("nutrition:add-meal", MEAL);
    expect(trackEventMock).not.toHaveBeenCalled();

    setVisibility("hidden");
    setVisibility("visible");
    markComposeSaved("nutrition:add-meal");
    endCompose("nutrition:add-meal");

    // Прапорець лишається зведеним після повернення: нас цікавить, чи
    // інтервал взагалі можна вважати часом запису.
    expect(lastPayload().backgrounded).toBe(true);
  });

  it("флашить сироту як abandoned при наступному відкритті", () => {
    beginCompose("nutrition:add-meal", MEAL);
    // Форму лишили відкритою і пішли зі сторінки — `endCompose` не
    // прилетів. Наступне відкриття мусить закрити борг, а не затерти його.
    beginCompose("nutrition:add-meal", MEAL);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(lastPayload().outcome).toBe("abandoned");

    markComposeSaved("nutrition:add-meal");
    endCompose("nutrition:add-meal");
    expect(trackEventMock).toHaveBeenCalledTimes(2);
    expect(lastPayload().outcome).toBe("saved");
  });

  it("не емітить нічого на закриття без відкриття", () => {
    expect(endCompose("nutrition:add-meal")).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("не пропускає вмісту запису в payload", () => {
    beginCompose("nutrition:add-meal", MEAL);
    markComposeSaved("nutrition:add-meal");
    endCompose("nutrition:add-meal");

    // Пін проти майбутнього «додамо лише назву страви, це ж зручно».
    // `scrubPII` чистить за іменами ключів і `name` не вирізав би.
    expect(Object.keys(lastPayload()).sort()).toEqual([
      "backgrounded",
      "entry_kind",
      "instrumentation_version",
      "module",
      "ms",
      "outcome",
      "surface",
    ]);
  });
});
