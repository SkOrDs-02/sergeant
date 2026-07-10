// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Branch-coverage for ExerciseDetailSheet.tsx.
 * Mocks the Sheet and SectionHeading to keep the test focused on the
 * sheet's own logic branches.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { FizrukData, Workout } from "@sergeant/fizruk-domain";

vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    children,
    title,
    description,
  }: {
    open: boolean;
    children: React.ReactNode;
    title?: string;
    description?: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        {title && <h2>{title}</h2>}
        {description && (
          <div data-testid="sheet-description">{description}</div>
        )}
        {children}
      </div>
    ) : null,
}));

vi.mock("@shared/components/ui/SectionHeading", () => ({
  SectionHeading: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="section-heading">{children}</div>
  ),
}));

import { ExerciseDetailSheet } from "./ExerciseDetailSheet";

afterEach(cleanup);

function noConflicts() {
  return { hasWarning: false, hasHardBlock: false, red: [], yellow: [] };
}

function makeExercise(
  overrides: Partial<FizrukData.RawExerciseDef> = {},
): FizrukData.RawExerciseDef {
  return {
    id: "ex_1",
    name: { uk: "Присідання", en: "Squat" },
    primaryGroup: "legs",
    primaryGroupUk: "Ноги",
    muscles: { primary: ["quad"], secondary: ["glutes"] },
    equipment: ["barbell"],
    description: "",
    ...overrides,
  } as unknown as FizrukData.RawExerciseDef;
}

const baseProps = {
  onClose: vi.fn(),
  mode: "catalog" as const,
  musclesUk: { quad: "Квадрицепс", glutes: "Сідниці" },
  rec: null,
  recoveryConflictsForExercise: () => noConflicts(),
  activeWorkoutId: null,
  activeWorkout: null,
  addExerciseToActive: vi.fn(),
  onDeleteRequest: vi.fn(),
};

describe("ExerciseDetailSheet – selected=null", () => {
  it("renders nothing when selected is null", () => {
    const { container } = render(
      <ExerciseDetailSheet {...baseProps} selected={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("ExerciseDetailSheet – catalog mode", () => {
  it("renders exercise name and muscles", () => {
    render(<ExerciseDetailSheet {...baseProps} selected={makeExercise()} />);
    expect(screen.getByText("Присідання")).toBeTruthy();
    expect(screen.getByText(/квадрицепс/i)).toBeTruthy();
  });

  it("renders muscle secondary tags", () => {
    render(<ExerciseDetailSheet {...baseProps} selected={makeExercise()} />);
    expect(screen.getByText(/сідниці/i)).toBeTruthy();
  });

  it("renders equipment labels from equipmentUk field", () => {
    const ex = makeExercise({
      equipmentUk: ["Штанга"],
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    expect(screen.getByText("Штанга")).toBeTruthy();
  });

  it("renders tips when present", () => {
    const ex = makeExercise({
      tips: ["Тримай спину рівно"],
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    expect(screen.getByText("Тримай спину рівно")).toBeTruthy();
  });

  it("renders images when present", () => {
    const ex = makeExercise({
      images: ["https://example.com/img.jpg"],
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/img.jpg");
  });

  it("renders the level when present", () => {
    const ex = makeExercise({
      level: "beginner",
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    const desc = screen.getByTestId("sheet-description");
    expect(desc.textContent).toContain("beginner");
  });

  it("shows delete button for custom exercises (_custom=true)", () => {
    const ex = makeExercise({
      _custom: true,
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    const onDeleteRequest = vi.fn();
    render(
      <ExerciseDetailSheet
        {...baseProps}
        selected={ex}
        onDeleteRequest={onDeleteRequest}
      />,
    );
    const deleteBtn = screen.getByText(/видалити/i);
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
  });

  it("shows delete button for exercises with source=manual", () => {
    const ex = makeExercise({
      source: "manual",
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    expect(screen.getByText(/видалити/i)).toBeTruthy();
  });

  it("shows delete button for exercises with id starting with custom_", () => {
    const ex = makeExercise({ id: "custom_abc" });
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    expect(screen.getByText(/видалити/i)).toBeTruthy();
  });
});

describe("ExerciseDetailSheet – recovery conflicts", () => {
  it("shows the warning banner when hasWarning=true with red and yellow", () => {
    render(
      <ExerciseDetailSheet
        {...baseProps}
        selected={makeExercise()}
        recoveryConflictsForExercise={() => ({
          hasWarning: true,
          hasHardBlock: false,
          red: [
            { id: "quad", label: "Квадрицепс", role: "primary", status: "red" },
          ],
          yellow: [
            {
              id: "glutes",
              label: "Сідниці",
              role: "secondary",
              status: "yellow",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/рано/i)).toBeTruthy();
    expect(screen.getByText(/краще почекати/i)).toBeTruthy();
  });

  it("shows warning banner with only yellow entries", () => {
    render(
      <ExerciseDetailSheet
        {...baseProps}
        selected={makeExercise()}
        recoveryConflictsForExercise={() => ({
          hasWarning: true,
          hasHardBlock: false,
          red: [],
          yellow: [
            { id: "bicep", label: "Біцепс", role: "primary", status: "yellow" },
          ],
        })}
      />,
    );
    expect(screen.queryByText(/рано/i)).toBeNull();
    expect(screen.getByText(/краще почекати/i)).toBeTruthy();
  });
});

describe("ExerciseDetailSheet – log mode", () => {
  it("shows add-to-workout button in log mode", () => {
    render(
      <ExerciseDetailSheet
        {...baseProps}
        mode="log"
        selected={makeExercise()}
        activeWorkoutId="w1"
        activeWorkout={
          {
            id: "w1",
            endedAt: null,
            items: [],
            startedAt: new Date().toISOString(),
          } as unknown as Workout
        }
      />,
    );
    expect(screen.getByText(/додати в активне/i)).toBeTruthy();
  });

  it("calls addExerciseToActive and onClose when add button clicked with active workout", () => {
    const addExerciseToActive = vi.fn();
    const onClose = vi.fn();
    const activeWorkout = {
      id: "w1",
      endedAt: null,
      items: [],
      startedAt: new Date().toISOString(),
    } as unknown as Workout;

    render(
      <ExerciseDetailSheet
        {...baseProps}
        mode="log"
        selected={makeExercise()}
        activeWorkoutId="w1"
        activeWorkout={activeWorkout}
        addExerciseToActive={addExerciseToActive}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText(/додати в активне/i));
    expect(addExerciseToActive).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("warns via toast when no active workout in log mode", () => {
    const toastWarning = vi.fn();
    render(
      <ExerciseDetailSheet
        {...baseProps}
        mode="log"
        selected={makeExercise()}
        activeWorkoutId={null}
        toast={{ warning: toastWarning }}
      />,
    );
    fireEvent.click(screen.getByText(/додати в активне/i));
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it("warns via toast when the active workout is already ended", () => {
    const toastWarning = vi.fn();
    const endedWorkout = {
      id: "w1",
      endedAt: new Date().toISOString(),
      items: [],
      startedAt: new Date().toISOString(),
    } as unknown as Workout;

    render(
      <ExerciseDetailSheet
        {...baseProps}
        mode="log"
        selected={makeExercise()}
        activeWorkoutId="w1"
        activeWorkout={endedWorkout}
        toast={{ warning: toastWarning }}
      />,
    );
    fireEvent.click(screen.getByText(/додати в активне/i));
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });
});

describe("ExerciseDetailSheet – description", () => {
  it("renders description text when present", () => {
    const ex = makeExercise({
      description: "Базова вправа для ніг",
    } as unknown as Partial<FizrukData.RawExerciseDef>);
    render(<ExerciseDetailSheet {...baseProps} selected={ex} />);
    expect(screen.getByText("Базова вправа для ніг")).toBeTruthy();
  });
});
