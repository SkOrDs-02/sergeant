/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SuspenseWithMinDelay } from "./SuspenseWithMinDelay";

afterEach(cleanup);

describe("SuspenseWithMinDelay", () => {
  it("renders already-resolved children inside the fade-in host", () => {
    render(
      <SuspenseWithMinDelay fallback={<div>Loading…</div>}>
        <div>Resolved content</div>
      </SuspenseWithMinDelay>,
    );
    expect(screen.getByText("Resolved content")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("shows the fallback (wrapped in the min-delay host) while a child suspends", () => {
    let resolved = false;
    const promise = new Promise<void>((r) => {
      setTimeout(() => {
        resolved = true;
        r();
      }, 1000);
    });
    function Suspender() {
      if (!resolved) throw promise;
      return <div>Done</div>;
    }
    render(
      <SuspenseWithMinDelay fallback={<div>Loading…</div>} minDelayMs={300}>
        <Suspender />
      </SuspenseWithMinDelay>,
    );
    // While suspended, the fallback content is shown.
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("wraps content in a motion-safe fade-in host element", () => {
    render(
      <SuspenseWithMinDelay fallback={<div>L</div>}>
        <span data-testid="kid">hi</span>
      </SuspenseWithMinDelay>,
    );
    const kid = screen.getByTestId("kid");
    const host = kid.parentElement as HTMLElement;
    expect(host.className).toContain("animate-fade-in");
  });
});
