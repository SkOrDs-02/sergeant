// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkoutGroupingControls } from "./WorkoutGroupingControls";

describe("WorkoutGroupingControls", () => {
  beforeEach(cleanup);

  it("shows the entry button when select-mode is off", () => {
    const onEnter = vi.fn();
    render(
      <WorkoutGroupingControls
        selectedCount={0}
        selectMode={false}
        onEnterSelectMode={onEnter}
        onCancelSelectMode={vi.fn()}
        onCreateGroup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Об.+єднати/ }));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("disables both create buttons when fewer than 2 items are selected", () => {
    render(
      <WorkoutGroupingControls
        selectedCount={1}
        selectMode={true}
        onEnterSelectMode={vi.fn()}
        onCancelSelectMode={vi.fn()}
        onCreateGroup={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", { name: /Суперсет/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /Коло/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("creates a superset on click when 2-3 items are selected", () => {
    const onCreate = vi.fn();
    render(
      <WorkoutGroupingControls
        selectedCount={2}
        selectMode={true}
        onEnterSelectMode={vi.fn()}
        onCancelSelectMode={vi.fn()}
        onCreateGroup={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Суперсет/ }));
    expect(onCreate).toHaveBeenCalledWith("superset");
  });

  it("creates a circuit on click when 2-3 items are selected", () => {
    const onCreate = vi.fn();
    render(
      <WorkoutGroupingControls
        selectedCount={3}
        selectMode={true}
        onEnterSelectMode={vi.fn()}
        onCancelSelectMode={vi.fn()}
        onCreateGroup={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Коло/ }));
    expect(onCreate).toHaveBeenCalledWith("circuit");
  });

  it("invokes cancel from the Скасувати button", () => {
    const onCancel = vi.fn();
    render(
      <WorkoutGroupingControls
        selectedCount={2}
        selectMode={true}
        onEnterSelectMode={vi.fn()}
        onCancelSelectMode={onCancel}
        onCreateGroup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
