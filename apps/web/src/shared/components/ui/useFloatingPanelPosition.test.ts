// @vitest-environment jsdom
/**
 * Unit tests for `useFloatingPanelPosition` — measure on open +
 * remeasure on scroll/resize; clear when closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFloatingPanelPosition } from "./useFloatingPanelPosition";

function mockRect(
  el: HTMLElement,
  rect: { top: number; left: number; width: number; height: number },
) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  });
  Object.defineProperty(el, "offsetWidth", {
    configurable: true,
    get: () => rect.width,
  });
  Object.defineProperty(el, "offsetHeight", {
    configurable: true,
    get: () => rect.height,
  });
}

describe("useFloatingPanelPosition", () => {
  let trigger: HTMLDivElement;
  let panel: HTMLDivElement;

  beforeEach(() => {
    trigger = document.createElement("div");
    panel = document.createElement("div");
    document.body.append(trigger, panel);
    mockRect(trigger, { top: 100, left: 50, width: 40, height: 20 });
    mockRect(panel, { top: 0, left: 0, width: 200, height: 80 });
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);
  });

  afterEach(() => {
    trigger.remove();
    panel.remove();
    vi.restoreAllMocks();
  });

  it("returns null when closed", () => {
    const triggerRef = { current: trigger as HTMLElement };
    const panelRef = { current: panel as HTMLElement };

    const { result } = renderHook(() =>
      useFloatingPanelPosition({
        open: false,
        triggerRef,
        panelRef,
        placement: "bottom-start",
      }),
    );
    expect(result.current).toBeNull();
  });

  it("measures bottom-start coords on open (offset 8)", () => {
    const triggerRef = { current: trigger as HTMLElement };
    const panelRef = { current: panel as HTMLElement };

    const { result } = renderHook(() =>
      useFloatingPanelPosition({
        open: true,
        triggerRef,
        panelRef,
        placement: "bottom-start",
        offset: 8,
      }),
    );

    // trigger bottom = 120; + offset 8 → top 128; left = trigger.left 50
    expect(result.current).toEqual(
      expect.objectContaining({
        top: 128,
        left: 50,
        triggerWidth: 40,
        triggerHeight: 20,
      }),
    );
  });

  it("remeasures on window resize", () => {
    const triggerRef = { current: trigger as HTMLElement };
    const panelRef = { current: panel as HTMLElement };

    const { result } = renderHook(() =>
      useFloatingPanelPosition({
        open: true,
        triggerRef,
        panelRef,
        placement: "bottom-start",
        offset: 8,
      }),
    );

    mockRect(trigger, { top: 200, left: 80, width: 40, height: 20 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current?.top).toBe(228); // 200+20+8
    expect(result.current?.left).toBe(80);
  });

  it("clears coords when open flips to false", () => {
    const triggerRef = { current: trigger as HTMLElement };
    const panelRef = { current: panel as HTMLElement };

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useFloatingPanelPosition({
          open,
          triggerRef,
          panelRef,
          placement: "top",
        }),
      { initialProps: { open: true } },
    );

    expect(result.current).not.toBeNull();
    rerender({ open: false });
    expect(result.current).toBeNull();
  });
});
