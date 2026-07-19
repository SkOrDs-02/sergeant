// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkoutsConfirmDialogs } from "./WorkoutsConfirmDialogs";
import type { WorkoutTemplate } from "../../hooks/useWorkoutTemplates";

function baseProps(
  overrides: Partial<Parameters<typeof WorkoutsConfirmDialogs>[0]> = {},
) {
  return {
    deleteExerciseConfirm: false,
    onDeleteExerciseConfirm: vi.fn(),
    onDeleteExerciseCancel: vi.fn(),
    riskyTemplate: null,
    onRiskyTemplateConfirm: vi.fn(),
    onRiskyTemplateCancel: vi.fn(),
    ...overrides,
  };
}

describe("WorkoutsConfirmDialogs", () => {
  beforeEach(cleanup);

  it("renders neither dialog when both are closed", () => {
    render(<WorkoutsConfirmDialogs {...baseProps()} />);
    expect(screen.queryByText("Видалити вправу?")).not.toBeInTheDocument();
    expect(
      screen.queryByText("М'язи ще відновлюються"),
    ).not.toBeInTheDocument();
  });

  it("opens the delete-exercise confirm and wires confirm/cancel", () => {
    const onDeleteExerciseConfirm = vi.fn();
    const onDeleteExerciseCancel = vi.fn();
    render(
      <WorkoutsConfirmDialogs
        {...baseProps({
          deleteExerciseConfirm: true,
          onDeleteExerciseConfirm,
          onDeleteExerciseCancel,
        })}
      />,
    );
    expect(screen.getByText("Видалити вправу?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Видалити"));
    expect(onDeleteExerciseConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Скасувати"));
    expect(onDeleteExerciseCancel).toHaveBeenCalledTimes(1);
  });

  it("opens the risky-template warning when riskyTemplate is set and wires confirm/cancel", () => {
    const onRiskyTemplateConfirm = vi.fn();
    const onRiskyTemplateCancel = vi.fn();
    const riskyTemplate = {
      id: "tpl1",
      name: "Push",
      exerciseIds: [],
      groups: [],
    } as unknown as WorkoutTemplate;
    render(
      <WorkoutsConfirmDialogs
        {...baseProps({
          riskyTemplate,
          onRiskyTemplateConfirm,
          onRiskyTemplateCancel,
        })}
      />,
    );
    expect(screen.getByText("М'язи ще відновлюються")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Так, почати"));
    expect(onRiskyTemplateConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Скасувати"));
    expect(onRiskyTemplateCancel).toHaveBeenCalledTimes(1);
  });
});
