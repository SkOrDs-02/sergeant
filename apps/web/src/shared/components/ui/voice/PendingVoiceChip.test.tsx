// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { PendingVoiceChip } from "./PendingVoiceChip";

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: vi.fn(),
}));

function rect({
  top,
  left,
  width,
  height,
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("PendingVoiceChip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(Date.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) =>
      window.clearTimeout(id),
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 640,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("portals below the anchor and supports explicit confirm/cancel actions", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PendingVoiceChip
        text="Додати каву"
        anchorRect={rect({ top: 120, left: 140, width: 44, height: 44 })}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Підтвердження голосового вводу",
    });
    expect(dialog).toHaveStyle({ top: "172px", left: "18px", width: "288px" });

    fireEvent.click(screen.getByRole("button", { name: /Додати каву/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(hapticTap).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("moves above near the viewport bottom and confirms after the countdown", () => {
    const onConfirm = vi.fn();
    render(
      <PendingVoiceChip
        text="Вечеря"
        anchorRect={rect({ top: 600, left: 300, width: 44, height: 36 })}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveStyle({ top: "520px" });
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(
      <PendingVoiceChip
        text="Скасувати голос"
        anchorRect={rect({ top: 80, left: 80, width: 44, height: 44 })}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
