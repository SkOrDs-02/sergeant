// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Досягнута денна ціль води — джерело автовідмітки звички Рутини
 * (рішення власника 2026-11-18). Подія летить рівно раз, у мить, коли дія
 * людини вперше доводить суму дня до цілі.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  __resetHubBusForTests,
  onHubBus,
  type HubBusEvents,
} from "@shared/lib/modules/hubBus";
import { WATER_LOG_KEY } from "@sergeant/nutrition-domain";
import { useWaterTracker } from "./useWaterTracker";

type AutoMark = HubBusEvents["routineAutoMark"];

let events: AutoMark[] = [];
let off: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0, 0));
  localStorage.clear();
  __resetHubBusForTests();
  events = [];
  off = onHubBus("routineAutoMark", (detail) => events.push(detail));
});

afterEach(() => {
  off();
  vi.useRealTimers();
  localStorage.clear();
});

describe("useWaterTracker — ціль води як джерело автовідмітки", () => {
  it("нижче цілі події немає, перетин дає рівно одну, склянка після — нічого", () => {
    const { result } = renderHook(() => useWaterTracker(1000));
    act(() => result.current.add(500));
    expect(events).toEqual([]);
    act(() => result.current.add(500));
    expect(events).toEqual([
      { source: "nutrition_water_goal", dayKey: "2026-11-18" },
    ]);
    act(() => result.current.add(250));
    expect(events).toHaveLength(1);
  });

  it("зменшення нижче цілі й новий перетин того ж дня нової події не дають", () => {
    const { result } = renderHook(() => useWaterTracker(1000));
    act(() => result.current.add(1000));
    act(() => result.current.subtract(250));
    act(() => result.current.add(250));
    expect(events).toHaveLength(1);
  });

  it("без цілі події немає", () => {
    const { result } = renderHook(() => useWaterTracker(0));
    act(() => result.current.add(3000));
    expect(events).toEqual([]);
  });

  it("запис іншого дня несе ключ того дня за годинником пристрою", () => {
    vi.setSystemTime(new Date(2026, 10, 17, 23, 50, 0));
    const { result } = renderHook(() => useWaterTracker(500));
    act(() => result.current.add(500));
    expect(events).toEqual([
      { source: "nutrition_water_goal", dayKey: "2026-11-17" },
    ]);
  });

  it("дані, що вже були в сховищі (синк, відновлення), події не дають", () => {
    localStorage.setItem(WATER_LOG_KEY, JSON.stringify({ "2026-11-18": 2000 }));
    const { result } = renderHook(() => useWaterTracker(1000));
    expect(events).toEqual([]);
    act(() => result.current.add(250));
    expect(events).toEqual([]);
  });
});
