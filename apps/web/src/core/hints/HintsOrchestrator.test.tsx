/** @vitest-environment jsdom */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  pickNextHintMock,
  recordHintShownMock,
  getRetentionHintIdMock,
  canShowHintMock,
  getFirstActionStartedAtMock,
  toastInfoMock,
  emitHubBusMock,
  trackEventMock,
  hubPrefValue,
} = vi.hoisted(() => ({
  pickNextHintMock: vi.fn(),
  recordHintShownMock: vi.fn(),
  getRetentionHintIdMock: vi.fn(),
  canShowHintMock: vi.fn(),
  getFirstActionStartedAtMock: vi.fn(),
  toastInfoMock: vi.fn(),
  emitHubBusMock: vi.fn(),
  trackEventMock: vi.fn(),
  hubPrefValue: { showHints: true as boolean },
}));

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    pickNextHint: pickNextHintMock,
    recordHintShown: recordHintShownMock,
    getRetentionHintId: getRetentionHintIdMock,
    canShowHint: canShowHintMock,
    getFirstActionStartedAt: getFirstActionStartedAtMock,
  };
});
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ info: toastInfoMock }),
}));
vi.mock("@shared/hooks", () => ({
  useShortcutGlyph: () => ({ modK: "Ctrl+K" }),
}));
vi.mock("@shared/lib/modules/hubBus", () => ({ emitHubBus: emitHubBusMock }));
vi.mock("../observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return {
    ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS,
    trackEvent: trackEventMock,
  };
});
vi.mock("../settings/hubPrefs", () => ({
  useHubPref: () => [hubPrefValue.showHints],
}));

import { HintsOrchestrator } from "./HintsOrchestrator";

describe("HintsOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hubPrefValue.showHints = true;
    sessionStorage.clear();
    getRetentionHintIdMock.mockReturnValue(null);
    getFirstActionStartedAtMock.mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing", () => {
    const { container } = render(
      <HintsOrchestrator inFtuxSession={false} hasFirstRealEntry={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not show a hint when showHints is off", () => {
    hubPrefValue.showHints = false;
    render(<HintsOrchestrator inFtuxSession hasFirstRealEntry={false} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(pickNextHintMock).not.toHaveBeenCalled();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("shows an FTUX hint after the calmer 8s delay", () => {
    pickNextHintMock.mockReturnValue("ftux_quick_add");
    render(<HintsOrchestrator inFtuxSession hasFirstRealEntry={false} />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(pickNextHintMock).toHaveBeenCalled();
    expect(recordHintShownMock).toHaveBeenCalledWith(
      expect.anything(),
      "ftux_quick_add",
    );
    expect(toastInfoMock).toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalled();
  });

  it("does nothing when there are no candidates and no real entry", () => {
    render(
      <HintsOrchestrator inFtuxSession={false} hasFirstRealEntry={false} />,
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(pickNextHintMock).not.toHaveBeenCalled();
  });

  it("prefers a retention hint over a general hint", () => {
    getFirstActionStartedAtMock.mockReturnValue(Date.now());
    getRetentionHintIdMock.mockReturnValue("retention_day_1");
    canShowHintMock.mockReturnValue({ ok: true });
    render(<HintsOrchestrator inFtuxSession={false} hasFirstRealEntry />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(recordHintShownMock).toHaveBeenCalledWith(
      expect.anything(),
      "retention_day_1",
    );
    // retention hint short-circuits before pickNextHint
    expect(pickNextHintMock).not.toHaveBeenCalled();
    expect(toastInfoMock).toHaveBeenCalledWith(expect.any(String), 6000);
  });

  it("wires the open-chat action which emits on the hub bus", () => {
    pickNextHintMock.mockReturnValue("ftux_open_chat");
    render(<HintsOrchestrator inFtuxSession hasFirstRealEntry={false} />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    const lastCall = toastInfoMock.mock.calls.at(-1)!;
    const action = lastCall[2] as { label: string; onClick: () => void };
    expect(action.label).toBe("Відкрити чат");
    action.onClick();
    expect(emitHubBusMock).toHaveBeenCalledWith("openChat", {
      message: "Що мені важливо сьогодні?",
    });
  });

  it("falls back to picking a hint when the retention check is not ok", () => {
    getFirstActionStartedAtMock.mockReturnValue(Date.now());
    getRetentionHintIdMock.mockReturnValue("retention_day_1");
    canShowHintMock.mockReturnValue({ ok: false });
    pickNextHintMock.mockReturnValue("module_first_entry");
    render(<HintsOrchestrator inFtuxSession={false} hasFirstRealEntry />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(pickNextHintMock).toHaveBeenCalled();
    expect(recordHintShownMock).toHaveBeenCalledWith(
      expect.anything(),
      "module_first_entry",
    );
  });

  it("shows at most one educational toast per browser session", () => {
    pickNextHintMock.mockReturnValue("ftux_quick_add");
    const first = render(
      <HintsOrchestrator inFtuxSession hasFirstRealEntry={false} />,
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(toastInfoMock).toHaveBeenCalledTimes(1);

    first.unmount();
    render(<HintsOrchestrator inFtuxSession hasFirstRealEntry={false} />);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
  });
});
