// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoveryFocusCard } from "./RecoveryFocusCard";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("RecoveryFocusCard", () => {
  // V-10 (fizruk deep audit, 2026-08-07): the panel used to default to
  // collapsed, hiding the module's canonical feature (canon fizruk §4)
  // behind an extra tap. It must now be open on first render.
  it("renders the detail panel expanded by default (V-10)", () => {
    render(<RecoveryFocusCard />);
    expect(screen.getByText("Відновлення й фокус")).toBeInTheDocument();
    expect(screen.getByText("готово")).toBeInTheDocument();
    expect(screen.getByText("Пріоритет після відпочинку")).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("collapses the detail panel on toggle", () => {
    render(<RecoveryFocusCard />);
    const toggle = screen.getByRole("button", { expanded: true });
    fireEvent.click(toggle);
    expect(screen.queryByText("готово")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("re-expands the detail panel after a collapse", () => {
    render(<RecoveryFocusCard />);
    const toggle = screen.getByRole("button", { expanded: true });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("готово")).toBeInTheDocument();
  });

  it("invokes onOpenAtlas when the Атлас button is clicked", () => {
    const onOpenAtlas = vi.fn();
    render(<RecoveryFocusCard onOpenAtlas={onOpenAtlas} />);
    fireEvent.click(screen.getByLabelText("Відкрити атлас мʼязів"));
    expect(onOpenAtlas).toHaveBeenCalledTimes(1);
  });

  // Defect #2: the title used to be a raw `<h2>` nested INSIDE the toggle
  // `<button>`, which loses heading semantics for most AT. The `<h2>` now
  // wraps the whole toggle button instead (WAI-ARIA disclosure pattern).
  it("exposes the title as an h2 heading and keeps the toggle a real button", () => {
    render(<RecoveryFocusCard />);
    expect(
      screen.getByRole("heading", { level: 2, name: /Відновлення й фокус/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });
});
