// @vitest-environment jsdom
/**
 * Юніт-тести фабрики createSqliteReadGate: тік/підписка, mutation-window
 * семантика (DCRUD-007), браузерний лічильник + CustomEvent-контракт для
 * Playwright smoke, onAfterNotify і resetForTests. Модульні контракти
 * (fizruk emitHubBus тощо) лишаються в тестах модульних обгорток.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createSqliteReadGate } from "./createSqliteReadGate";

type CountsCarrier = typeof globalThis & {
  __sergeantSqliteRefreshCounts?: Record<string, number>;
};

afterEach(() => {
  delete (globalThis as CountsCarrier).__sergeantSqliteRefreshCounts;
});

describe("createSqliteReadGate", () => {
  it("useReadTick re-renders with an incremented tick after notify", () => {
    const gate = createSqliteReadGate("test-module");
    const { result } = renderHook(() => gate.useReadTick());
    expect(result.current).toBe(0);
    act(() => gate.notifyCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("defers notify while a mutation window is open (DCRUD-007)", () => {
    const gate = createSqliteReadGate("test-module");
    const { result } = renderHook(() => gate.useReadTick());
    gate.openMutationWindow();
    act(() => gate.notifyCacheRefresh());
    expect(result.current).toBe(0);
    gate.closeMutationWindow();
    act(() => gate.notifyCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("does not decrement pending windows below zero", () => {
    const gate = createSqliteReadGate("test-module");
    gate.closeMutationWindow();
    const { result } = renderHook(() => gate.useReadTick());
    act(() => gate.notifyCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("increments the per-module global refresh counter on notify", () => {
    const gate = createSqliteReadGate("test-module");
    gate.notifyCacheRefresh();
    gate.notifyCacheRefresh();
    expect(
      (globalThis as CountsCarrier).__sergeantSqliteRefreshCounts?.[
        "test-module"
      ],
    ).toBe(2);
  });

  it("dispatches the sergeant:sqlite-cache-refresh CustomEvent with the module id", () => {
    const gate = createSqliteReadGate("test-module");
    const seen: unknown[] = [];
    const onEvent = (e: Event) => seen.push((e as CustomEvent).detail);
    globalThis.addEventListener("sergeant:sqlite-cache-refresh", onEvent);
    try {
      gate.notifyCacheRefresh();
    } finally {
      globalThis.removeEventListener("sergeant:sqlite-cache-refresh", onEvent);
    }
    expect(seen).toEqual([{ module: "test-module" }]);
  });

  it("calls onAfterNotify after a successful notify, not while deferred", () => {
    const onAfterNotify = vi.fn();
    const gate = createSqliteReadGate("test-module", { onAfterNotify });
    gate.openMutationWindow();
    gate.notifyCacheRefresh();
    expect(onAfterNotify).not.toHaveBeenCalled();
    gate.closeMutationWindow();
    gate.notifyCacheRefresh();
    expect(onAfterNotify).toHaveBeenCalledTimes(1);
  });

  it("resetForTests clears tick and pending windows", () => {
    const gate = createSqliteReadGate("test-module");
    gate.openMutationWindow();
    gate.resetForTests();
    const { result } = renderHook(() => gate.useReadTick());
    expect(result.current).toBe(0);
    act(() => gate.notifyCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("two gates are fully isolated from each other", () => {
    const a = createSqliteReadGate("module-a");
    const b = createSqliteReadGate("module-b");
    const { result: tickA } = renderHook(() => a.useReadTick());
    const { result: tickB } = renderHook(() => b.useReadTick());
    a.openMutationWindow();
    act(() => {
      a.notifyCacheRefresh();
      b.notifyCacheRefresh();
    });
    expect(tickA.current).toBe(0);
    expect(tickB.current).toBe(1);
  });
});
