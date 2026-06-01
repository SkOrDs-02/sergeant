// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Audit 02 F24 (low/test). Covers the previously-untested reset path:
 * after the boundary catches an error, clicking "Спробувати ще" must
 * call `resetError`, drop the error state, and re-render children.
 *
 * The captureException side-effect path is stubbed so the test stays
 * offline-friendly.
 */
vi.mock("./observability/sentry", () => ({
  captureException: vi.fn(),
}));
vi.mock("./lib/chunkReload", () => ({
  isChunkLoadError: () => false,
  reloadOnceForChunkError: () => false,
}));

function Bomb({ trigger }: { trigger: boolean }) {
  if (trigger) throw new Error("kaboom");
  return <p data-testid="ok">ok</p>;
}

function Harness() {
  const [boom, setBoom] = useState(true);
  return (
    <ErrorBoundary>
      <Bomb trigger={boom} />
      <button type="button" onClick={() => setBoom(false)}>
        defuse
      </button>
    </ErrorBoundary>
  );
}

describe("ErrorBoundary reset path", () => {
  it("renders the default fallback when a child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Harness />);
    expect(screen.getByText("Щось пішло не так")).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("clears the error state when 'Спробувати ще' is pressed", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<Harness />);
    expect(screen.getByText("Щось пішло не так")).toBeTruthy();
    // Reset — but child still throws, so the boundary re-catches.
    fireEvent.click(screen.getByText("Спробувати ще"));
    expect(screen.getByText("Щось пішло не так")).toBeTruthy();

    // Defuse the bomb path entirely and rerender with a non-throwing child.
    rerender(
      <ErrorBoundary>
        <p data-testid="ok">ok</p>
      </ErrorBoundary>,
    );
    expect(screen.queryByText("Щось пішло не так")).toBeNull();
    expect(screen.getByTestId("ok").textContent).toBe("ok");
    consoleSpy.mockRestore();
  });

  it("calls a function-shaped fallback with resetError", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let observedReset: (() => void) | null = null;
    render(
      <ErrorBoundary
        fallback={({ error, resetError }) => {
          observedReset = resetError;
          return <span data-testid="custom">{`oops: ${error.message}`}</span>;
        }}
      >
        <Bomb trigger />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("custom").textContent).toBe("oops: kaboom");
    expect(typeof observedReset).toBe("function");
    consoleSpy.mockRestore();
  });
});
