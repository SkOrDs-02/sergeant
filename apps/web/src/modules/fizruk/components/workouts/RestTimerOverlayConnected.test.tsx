// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { RestTimerContext } from "../../context/RestTimerContext";
import { RestTimerOverlayConnected } from "./RestTimerOverlayConnected";

function Harness({
  initial = null as { remaining: number; total: number } | null,
}) {
  const [restTimer, setRestTimer] = useState(initial);
  return (
    <RestTimerContext.Provider value={{ restTimer, setRestTimer }}>
      <RestTimerOverlayConnected />
    </RestTimerContext.Provider>
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
    fireEvent.click(screen.getByRole("button", { name: /Скасувати/i }));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
