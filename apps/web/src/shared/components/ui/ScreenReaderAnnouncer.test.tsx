/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import {
  ScreenReaderAnnouncerProvider,
  useAnnounce,
} from "./ScreenReaderAnnouncer";

afterEach(cleanup);

function setup() {
  const ref: { current: ReturnType<typeof useAnnounce> | null } = {
    current: null,
  };
  function Bridge() {
    ref.current = useAnnounce();
    return null;
  }
  render(
    <ScreenReaderAnnouncerProvider>
      <Bridge />
    </ScreenReaderAnnouncerProvider>,
  );
  if (!ref.current) throw new Error("Bridge not mounted");
  return ref.current;
}

describe("ScreenReaderAnnouncer", () => {
  it("renders two hidden live regions (polite + assertive)", () => {
    setup();
    const polite = screen.getByRole("status");
    const assertive = screen.getByRole("alert");
    expect(polite.getAttribute("aria-live")).toBe("polite");
    expect(polite.getAttribute("aria-atomic")).toBe("true");
    expect(polite.className).toContain("sr-only");
    expect(assertive.getAttribute("aria-live")).toBe("assertive");
  });

  it("default announce() places the message in the polite region", async () => {
    const api = setup();
    act(() => api.announce("Транзакцію збережено"));
    // The message is set inside a requestAnimationFrame callback.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Транзакцію збережено",
      ),
    );
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("assertive announce() places the message in the alert region", async () => {
    const api = setup();
    act(() => api.announce("Помилка", { politeness: "assertive" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Помилка"),
    );
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("auto-clears the message after the 5s timeout", async () => {
    vi.useFakeTimers();
    try {
      const ref: { current: ReturnType<typeof useAnnounce> | null } = {
        current: null,
      };
      function Bridge() {
        ref.current = useAnnounce();
        return null;
      }
      render(
        <ScreenReaderAnnouncerProvider>
          <Bridge />
        </ScreenReaderAnnouncerProvider>,
      );
      act(() => {
        ref.current!.announce("Тимчасове");
      });
      // Flush the rAF that sets the message, then run the clear timer.
      act(() => {
        vi.advanceTimersByTime(16);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("status").textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("useAnnounce outside the provider returns a no-op that does not throw", () => {
    let api: ReturnType<typeof useAnnounce> | null = null;
    function Probe() {
      api = useAnnounce();
      return null;
    }
    render(<Probe />);
    expect(() => api!.announce("nobody listening")).not.toThrow();
  });
});
