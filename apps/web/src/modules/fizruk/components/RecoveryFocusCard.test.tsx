// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoveryFocusCard } from "./RecoveryFocusCard";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("RecoveryFocusCard", () => {
  it("renders the collapsed header by default", () => {
    render(<RecoveryFocusCard />);
    expect(screen.getByText("Відновлення й фокус")).toBeInTheDocument();
    // Collapsed: legend not shown
    expect(screen.queryByText("готово")).not.toBeInTheDocument();
  });

  it("expands the detail panel on toggle", () => {
    render(<RecoveryFocusCard />);
    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.click(toggle);
    expect(screen.getByText("готово")).toBeInTheDocument();
    expect(screen.getByText("Пріоритет після відпочинку")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });
});
