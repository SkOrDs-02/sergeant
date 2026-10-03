// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { RestTimerContext } from "../../context/RestTimerContext";
import { RestTimerOverlayConnected } from "./RestTimerOverlayConnected";
import { ScreenReaderAnnouncerProvider } from "@shared/components/ui/ScreenReaderAnnouncer";

function Harness({
  initial = null as { remaining: number; total: number } | null,
}) {
  const [restTimer, setRestTimer] = useState(initial);
  return (
    <ScreenReaderAnnouncerProvider>
      <RestTimerContext.Provider value={{ restTimer, setRestTimer }}>
        <RestTimerOverlayConnected />
      </RestTimerContext.Provider>
    </ScreenReaderAnnouncerProvider>
  );
}

describe("RestTimerOverlayConnected", () => {
  afterEach(cleanup);

  it("renders nothing when context has no active timer", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('[role="timer"]')).toBeNull();
  });

  it("clears rest timer via overlay cancel", () => {
    render(<Harness initial={{ remaining: 30, total: 60 }} />);
    expect(screen.getByRole("timer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Пропустити/i }));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("adjusts the running timer without changing the (static) aria-label", () => {
    render(<Harness initial={{ remaining: 30, total: 60 }} />);
    const labelBefore = screen.getByRole("timer").getAttribute("aria-label");

    fireEvent.click(screen.getByRole("button", { name: "Додати 15 секунд" }));

    expect(screen.getByText("00:45")).toBeInTheDocument();
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      labelBefore,
    );
  });

  // Milestone announcements (fixed 2026-08-08): start fires once when the
  // context timer transitions null → active; finish fires once when it
  // is cancelled ("Пропустити") or counts down and gets cleared. The
  // continuous per-second `aria-live` chatter this replaces is asserted
  // gone in `RestTimerOverlay.test.tsx`.
  it("announces a start milestone via the shared screen-reader live region", async () => {
    render(<Harness initial={{ remaining: 30, total: 60 }} />);
    // The message lands inside a `requestAnimationFrame` callback — see
    // `ScreenReaderAnnouncer.tsx`.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Відпочинок 60 секунд",
      ),
    );
  });

  it("announces a finish milestone once cancelled", async () => {
    render(<Harness initial={{ remaining: 30, total: 60 }} />);
    fireEvent.click(screen.getByRole("button", { name: /Пропустити/i }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Відпочинок завершено",
      ),
    );
  });
});
