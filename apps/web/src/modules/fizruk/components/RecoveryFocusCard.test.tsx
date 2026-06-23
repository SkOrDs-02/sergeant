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
});
