/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  markSignalShown,
  readSignalContext,
  resetSignalAttribution,
} from "./valueSignalAttribution";

const KEY = "sergeant.v2.valueSignal.lastShown";

beforeEach(() => {
  resetSignalAttribution();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  resetSignalAttribution();
});

describe("valueSignalAttribution", () => {
  it("без показу сигналу атрибуції немає", () => {
    expect(readSignalContext()).toEqual({
      after_signal: false,
      ms_since_signal: null,
      signal: null,
    });
  });

  it("після показу віддає стабільний kind і сирий інтервал", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
    markSignalShown({ signal: "routine-todo-evening", module: "routine" });

    vi.setSystemTime(new Date("2026-07-25T10:00:42.000Z"));
    expect(readSignalContext("routine")).toEqual({
      after_signal: true,
      ms_since_signal: 42_000,
      signal: "routine-todo-evening",
    });
  });

  it("читання НЕ очищає стан — кілька дій після одного показу", () => {
    markSignalShown({ signal: "nutrition-protein-low", module: "nutrition" });
    const first = readSignalContext("nutrition");
    const second = readSignalContext("nutrition");
    expect(first.after_signal).toBe(true);
    expect(second.after_signal).toBe(true);
    expect(second.signal).toBe("nutrition-protein-low");
  });

  it("не атрибутує дію в чужому модулі", () => {
    markSignalShown({ signal: "finyk-coffee-limit", module: "finyk" });
    expect(readSignalContext("routine").after_signal).toBe(false);
    expect(readSignalContext("finyk").after_signal).toBe(true);
  });

  it("без аргументу module атрибутує крос-модульно", () => {
    markSignalShown({ signal: "finyk-coffee-limit", module: "finyk" });
    expect(readSignalContext().after_signal).toBe(true);
  });

  it("запис старший за TTL 24 год не атрибутується", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T09:00:00.000Z"));
    markSignalShown({ signal: "fizruk-pr-pending", module: "fizruk" });

    vi.setSystemTime(new Date("2026-07-25T09:00:01.000Z"));
    expect(readSignalContext("fizruk").after_signal).toBe(false);
  });

  it("останній показ витісняє попередній", () => {
    markSignalShown({ signal: "finyk-coffee-limit", module: "finyk" });
    markSignalShown({ signal: "finyk-recurring-detected", module: "finyk" });
    expect(readSignalContext("finyk").signal).toBe("finyk-recurring-detected");
  });

  it("дзеркалить у sessionStorage і відновлюється після reload-у вкладки", () => {
    markSignalShown({ signal: "routine-todo-evening", module: "routine" });
    expect(sessionStorage.getItem(KEY)).toContain("routine-todo-evening");

    // Імітація reload-у: in-memory стор порожній, дзеркало лишилось.
    const mirrored = sessionStorage.getItem(KEY)!;
    resetSignalAttribution();
    sessionStorage.setItem(KEY, mirrored);

    expect(readSignalContext("routine")).toMatchObject({
      after_signal: true,
      signal: "routine-todo-evening",
    });
  });

  it("зіпсоване дзеркало не кидає і не атрибутує", () => {
    sessionStorage.setItem(KEY, "{ not json");
    expect(readSignalContext().after_signal).toBe(false);
    sessionStorage.setItem(KEY, JSON.stringify({ signal: 1, at: "x" }));
    expect(readSignalContext().after_signal).toBe(false);
  });

  it("зсув годинника назад не дає відʼємний ms_since_signal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
    markSignalShown({ signal: "fizruk-pr-pending", module: "fizruk" });

    vi.setSystemTime(new Date("2026-07-25T09:59:00.000Z"));
    expect(readSignalContext("fizruk")).toEqual({
      after_signal: false,
      ms_since_signal: null,
      signal: null,
    });
  });

  it("порожній signal ігнорується", () => {
    markSignalShown({ signal: "", module: "finyk" });
    expect(readSignalContext().after_signal).toBe(false);
  });
});
