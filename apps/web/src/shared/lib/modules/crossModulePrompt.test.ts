/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToastApi } from "@shared/hooks/useToast";
import {
  ACCEPT_SNOOZE_MS,
  FATIGUE_WINDOW_MS,
  MAX_DISMISSALS,
  isCrossModulePromptSuppressed,
  recordCrossModulePromptAccepted,
  recordCrossModulePromptDismissed,
  resetCrossModulePromptForTesting,
  tryShowCrossModulePrompt,
} from "./crossModulePrompt";

const ID = "finyk-restaurant-to-meal";

interface CapturedAction {
  label: string;
  onClick: () => void;
}

interface MockToast extends ToastApi {
  readonly _action: CapturedAction | null;
}

function makeToast(): MockToast {
  const ref: { current: CapturedAction | null } = { current: null };
  const api: ToastApi = {
    show: vi.fn((_msg, _type, _duration, action) => {
      if (action) ref.current = action;
      return 7;
    }),
    success: vi.fn(() => 1),
    error: vi.fn(() => 2),
    info: vi.fn(() => 3),
    warning: vi.fn(() => 4),
    dismiss: vi.fn(),
  };
  Object.defineProperty(api, "_action", {
    get: () => ref.current,
    enumerable: true,
  });
  return api as MockToast;
}

describe("crossModulePrompt — suppression", () => {
  beforeEach(() => {
    resetCrossModulePromptForTesting(ID);
    navigator.vibrate = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCrossModulePromptForTesting(ID);
  });

  it("not suppressed by default", () => {
    expect(isCrossModulePromptSuppressed(ID)).toBe(false);
  });

  it(`suppressed after ${MAX_DISMISSALS} dismissals in window`, () => {
    for (let i = 0; i < MAX_DISMISSALS; i++) {
      recordCrossModulePromptDismissed(ID);
    }
    expect(isCrossModulePromptSuppressed(ID)).toBe(true);
  });

  it("dismissals older than window do NOT count", () => {
    const longAgo = Date.now() - FATIGUE_WINDOW_MS - 1000;
    for (let i = 0; i < MAX_DISMISSALS; i++) {
      recordCrossModulePromptDismissed(ID, longAgo);
    }
    expect(isCrossModulePromptSuppressed(ID)).toBe(false);
  });

  it("acceptance snoozes for ACCEPT_SNOOZE_MS, then re-enables", () => {
    const t0 = 1_000_000;
    recordCrossModulePromptAccepted(ID, t0);
    expect(isCrossModulePromptSuppressed(ID, t0 + 1000)).toBe(true);
    expect(isCrossModulePromptSuppressed(ID, t0 + ACCEPT_SNOOZE_MS + 1)).toBe(
      false,
    );
  });

  it("acceptance resets dismissal counter", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < MAX_DISMISSALS; i++) {
      recordCrossModulePromptDismissed(ID, t0 - 1000 + i);
    }
    expect(isCrossModulePromptSuppressed(ID, t0)).toBe(true);
    recordCrossModulePromptAccepted(ID, t0);
    // 12h+1ms after accept → snooze elapsed AND counter was wiped
    expect(isCrossModulePromptSuppressed(ID, t0 + ACCEPT_SNOOZE_MS + 1)).toBe(
      false,
    );
  });
});

describe("tryShowCrossModulePrompt", () => {
  beforeEach(() => {
    resetCrossModulePromptForTesting(ID);
    navigator.vibrate = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCrossModulePromptForTesting(ID);
  });

  it("shows the toast and returns true when not suppressed", () => {
    const toast = makeToast();
    const onAccept = vi.fn();

    const shown = tryShowCrossModulePrompt(toast, {
      id: ID,
      msg: "Додай прийом їжі?",
      acceptLabel: "Додати",
      onAccept,
    });

    expect(shown).toBe(true);
    expect(toast.show).toHaveBeenCalledTimes(1);
    const call = (toast.show as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("Додай прийом їжі?");
    expect(call[1]).toBe("info");
    expect(call[3]?.label).toBe("Додати");
  });

  it("returns false and does NOT call toast.show when suppressed", () => {
    for (let i = 0; i < MAX_DISMISSALS; i++) {
      recordCrossModulePromptDismissed(ID);
    }
    const toast = makeToast();

    const shown = tryShowCrossModulePrompt(toast, {
      id: ID,
      msg: "x",
      acceptLabel: "y",
      onAccept: vi.fn(),
    });

    expect(shown).toBe(false);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it("CTA tap → calls onAccept and snoozes the prompt", () => {
    const toast = makeToast();
    const onAccept = vi.fn();

    tryShowCrossModulePrompt(toast, {
      id: ID,
      msg: "x",
      acceptLabel: "y",
      onAccept,
    });

    toast._action?.onClick();
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledWith(7);
    // Snoozed immediately after acceptance
    expect(isCrossModulePromptSuppressed(ID)).toBe(true);
  });

  it("auto-dismiss (no CTA tap) increments dismissal counter", () => {
    const toast = makeToast();

    tryShowCrossModulePrompt(toast, {
      id: ID,
      msg: "x",
      acceptLabel: "y",
      onAccept: vi.fn(),
      duration: 1000,
    });

    // Run pending timers — fast-forwards the post-toast dismissal check
    vi.advanceTimersByTime(2000);

    // Dismissed once; not yet suppressed (need MAX_DISMISSALS).
    expect(isCrossModulePromptSuppressed(ID)).toBe(false);

    // 2 more dismissals → suppression kicks in.
    for (let i = 0; i < MAX_DISMISSALS - 1; i++) {
      recordCrossModulePromptDismissed(ID);
    }
    expect(isCrossModulePromptSuppressed(ID)).toBe(true);
  });
});
