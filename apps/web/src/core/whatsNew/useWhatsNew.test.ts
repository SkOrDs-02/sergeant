/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWhatsNew, SHOW_DELAY_MS } from "./useWhatsNew";
import { RELEASES } from "./releases";
import { WHATS_NEW_LAST_SEEN_KEY } from "./storage";

const trackEventMock = vi.fn();

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: (name: string, payload?: Record<string, unknown>) => {
      trackEventMock(name, payload);
    },
  };
});

const latest = RELEASES[0];
if (!latest) throw new Error("releases.ts must export at least one entry");

describe("useWhatsNew", () => {
  beforeEach(() => {
    localStorage.clear();
    trackEventMock.mockClear();
    vi.useFakeTimers();
  });

  it("stays closed when disabled even if release is unseen", () => {
    const { result } = renderHook(() => useWhatsNew({ enabled: false }));
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 100);
    });
    expect(result.current.open).toBe(false);
    expect(result.current.release).toBeNull();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("opens after delay when enabled and release is unseen", () => {
    const { result } = renderHook(() => useWhatsNew({ enabled: true }));
    expect(result.current.open).toBe(false);
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 1);
    });
    expect(result.current.open).toBe(true);
    expect(result.current.release?.id).toBe(latest.id);
    expect(trackEventMock).toHaveBeenCalledWith(
      "whats_new_shown",
      expect.objectContaining({ id: latest.id }),
    );
  });

  it("never opens when latest release is already seen", () => {
    localStorage.setItem(WHATS_NEW_LAST_SEEN_KEY, latest.id);
    const { result } = renderHook(() => useWhatsNew({ enabled: true }));
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 1);
    });
    expect(result.current.open).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("persists lastSeenId on close and fires whats_new_dismissed", () => {
    const { result } = renderHook(() => useWhatsNew({ enabled: true }));
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 1);
    });
    act(() => {
      result.current.onClose("close");
    });
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBe(latest.id);
    expect(trackEventMock).toHaveBeenCalledWith(
      "whats_new_dismissed",
      expect.objectContaining({ id: latest.id, via: "close" }),
    );
  });

  it("persists lastSeenId on CTA click and fires whats_new_cta_clicked", () => {
    const { result } = renderHook(() => useWhatsNew({ enabled: true }));
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 1);
    });
    act(() => {
      result.current.onCtaClick();
    });
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBe(latest.id);
    if (latest.cta) {
      expect(trackEventMock).toHaveBeenCalledWith(
        "whats_new_cta_clicked",
        expect.objectContaining({ id: latest.id, href: latest.cta.href }),
      );
    }
  });

  it("does not re-open after lastSeenId persists across remounts", () => {
    const { result, unmount } = renderHook(() =>
      useWhatsNew({ enabled: true }),
    );
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 1);
    });
    act(() => {
      result.current.onClose("close");
    });
    unmount();
    trackEventMock.mockClear();

    const second = renderHook(() => useWhatsNew({ enabled: true }));
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + 1);
    });
    expect(second.result.current.open).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});
