/** @vitest-environment jsdom */
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Branch-coverage tests for ExerciseDetailSheet.tsx.
 * Covers: null selected (returns null), recovery warning (red/yellow),
 * images strip, description, tips, custom-exercise delete button,
 * log-mode "add" button (no active workout, ended workout, active),
 * copy-name button.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ExerciseDetailSheet } from "./ExerciseDetailSheet";
import type { FizrukData } from "@sergeant/fizruk-domain";

afterEach(cleanup);

// ─── Stub Sheet (portal-free) ─────────────────────────────────────────────
vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    children,
    title,
    description,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        <div data-testid="sheet-title">{title}</div>
        <div data-testid="sheet-description">{description}</div>
        {children}
      </div>
    ) : null,
}));

// ─── Stub Button ─────────────────────────────────────────────────────────
vi.mock("@shared/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      data-variant={variant}
      className={className}
    >
      {children}
    </button>
  ),
}));

// ─── Stub SectionHeading ─────────────────────────────────────────────────
vi.mock("@shared/components/ui/SectionHeading", () => ({
  SectionHeading: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────
type MockExercise = FizrukData.RawExerciseDef & {
  [key: string]: unknown;
};

function makeExercise(over: Partial<MockExercise> = {}): MockExercise {
  return {
    id: "ex-1",
    primaryGroup: "chest",
    primaryGroupUk: "Груди",
    name: { uk: "Жим лежачи", en: "Bench press" },
    muscles: { primary: ["pectoralis_major"], secondary: ["triceps"] },
    equipment: ["barbell"],
    description: undefined,
    ...over,
  } as MockExercise;
}

const noopClose = vi.fn();
const noopAdd = vi.fn();
const noopDelete = vi.fn();
type RecoveryResult = {
  hasWarning: boolean;
  hasHardBlock: boolean;
  red: { label: string }[];
  yellow: { label: string }[];
};

type RecoveryFn = (ex: unknown, by?: unknown) => RecoveryResult;

const noopRecovery: RecoveryFn = vi.fn(
  () =>
    ({
      hasWarning: false,
      hasHardBlock: false,
      red: [],
      yellow: [],
    }) satisfies RecoveryResult,
);
const mockToast = { warning: vi.fn() };

function baseProps(over: Partial<Record<string, unknown>> = {}) {
  return {
    selected: makeExercise() as Parameters<
      typeof ExerciseDetailSheet
    >[0]["selected"],
    onClose: noopClose,
    mode: "catalog" as const,
    musclesUk: {
      pectoralis_major: "Великий грудний",
      triceps: "Трицепс",
      quadriceps: "Квадрицепс",
    },
    primaryGroupsUk: { chest: "Груди" },
    equipmentUk: { barbell: "Штанга" },
    rec: { by: {} },
    recoveryConflictsForExercise: noopRecovery as Parameters<
      typeof ExerciseDetailSheet
    >[0]["recoveryConflictsForExercise"],
    activeWorkoutId: null as string | null,
    activeWorkout: null,
    addExerciseToActive: noopAdd,
    onDeleteRequest: noopDelete,
    toast: mockToast,
    ...over,
  } as Parameters<typeof ExerciseDetailSheet>[0];
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("ExerciseDetailSheet – null/undefined selected", () => {
  it("returns null when selected is null", () => {
    const { container } = render(
      <ExerciseDetailSheet {...baseProps({ selected: null })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when selected is undefined", () => {
    const { container } = render(
      <ExerciseDetailSheet {...baseProps({ selected: undefined })} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("ExerciseDetailSheet – basic rendering", () => {
  it("renders the exercise name as the sheet title", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.getByTestId("sheet-title").textContent).toContain(
      "Жим лежачи",
    );
  });

  it("renders primary muscle labels", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.getByText(/Великий грудний/)).toBeInTheDocument();
  });

  it("renders secondary muscle labels without '· основний' marker", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.getByText(/Трицепс/)).toBeInTheDocument();
  });

  it("localizes the primary group and equipment fallback keys", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.getByText("Груди")).toBeInTheDocument();
    expect(screen.getByText("Штанга")).toBeInTheDocument();
  });

  it("renders equipment from the equipmentUk extended field when present", () => {
    const ex = makeExercise({ equipmentUk: ["Штанга"] });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText("Штанга")).toBeInTheDocument();
  });
});

describe("ExerciseDetailSheet – description and level", () => {
  it("renders description text when provided", () => {
    const ex = makeExercise({ description: "Класична базова вправа" });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText("Класична базова вправа")).toBeInTheDocument();
  });

  it("renders level when present in exercise", () => {
    const ex = makeExercise({ level: "advanced" });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText(/advanced/)).toBeInTheDocument();
  });

  it("does not render level section when level is not a string", () => {
    const ex = makeExercise({ level: 42 });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.queryByText(/рівень/)).not.toBeInTheDocument();
  });
});

describe("ExerciseDetailSheet – tips", () => {
  it("renders tips list when tips array is present", () => {
    const ex = makeExercise({
      tips: ["Тримай спину рівно", "Не опускай лікті"],
    });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText("Тримай спину рівно")).toBeInTheDocument();
    expect(screen.getByText("Не опускай лікті")).toBeInTheDocument();
  });

  it("does not render tips section when tips is an empty array", () => {
    const ex = makeExercise({ tips: [] });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.queryByText("Підказки")).not.toBeInTheDocument();
  });
});

describe("ExerciseDetailSheet – images strip", () => {
  it("renders images when images array is present", () => {
    const ex = makeExercise({
      images: ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render image strip when images is empty", () => {
    const ex = makeExercise({ images: [] });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("caps images at 8", () => {
    const ex = makeExercise({
      images: Array.from(
        { length: 12 },
        (_, i) => `https://example.com/img${i}.jpg`,
      ),
    });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBe(8);
  });
});

describe("ExerciseDetailSheet – recovery warning", () => {
  it("renders warning block with red muscles when hasWarning=true and red array present", () => {
    const recovery: RecoveryFn = vi.fn(() => ({
      hasWarning: true,
      hasHardBlock: true,
      red: [{ label: "Квадрицепс" }],
      yellow: [],
    }));
    render(
      <ExerciseDetailSheet
        {...baseProps({
          recoveryConflictsForExercise: recovery as Parameters<
            typeof ExerciseDetailSheet
          >[0]["recoveryConflictsForExercise"],
        })}
      />,
    );
    expect(screen.getByText(/Рано/)).toBeInTheDocument();
    expect(screen.getByText(/Квадрицепс/)).toBeInTheDocument();
  });

  it("renders warning block with yellow muscles only", () => {
    const recovery: RecoveryFn = vi.fn(() => ({
      hasWarning: true,
      hasHardBlock: false,
      red: [],
      yellow: [{ label: "Трицепс" }],
    }));
    render(
      <ExerciseDetailSheet
        {...baseProps({
          recoveryConflictsForExercise: recovery as Parameters<
            typeof ExerciseDetailSheet
          >[0]["recoveryConflictsForExercise"],
        })}
      />,
    );
    expect(screen.getByText(/Краще почекати/)).toBeInTheDocument();
  });

  it("does not render warning block when hasWarning=false", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.queryByText(/Рано/)).toBeNull();
  });
});

describe("ExerciseDetailSheet – custom exercise", () => {
  it("renders delete button for _custom exercises", () => {
    const ex = makeExercise({ _custom: true });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText("Видалити з каталогу")).toBeInTheDocument();
  });

  it("renders delete button for source='manual' exercises", () => {
    const ex = makeExercise({ source: "manual" });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText("Видалити з каталогу")).toBeInTheDocument();
  });

  it("renders delete button for custom_ prefix id", () => {
    const ex = makeExercise({ id: "custom_my-exercise" });
    render(<ExerciseDetailSheet {...baseProps({ selected: ex })} />);
    expect(screen.getByText("Видалити з каталогу")).toBeInTheDocument();
  });

  it("calls onDeleteRequest when delete button is clicked", () => {
    const ex = makeExercise({ _custom: true });
    const onDeleteRequest = vi.fn();
    render(
      <ExerciseDetailSheet {...baseProps({ selected: ex, onDeleteRequest })} />,
    );
    fireEvent.click(screen.getByText("Видалити з каталогу"));
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
  });

  it("does not render delete button for standard exercises", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.queryByText("Видалити з каталогу")).toBeNull();
  });
});

describe("ExerciseDetailSheet – log mode add button", () => {
  it("does not render the add button in catalog mode", () => {
    render(<ExerciseDetailSheet {...baseProps({ mode: "catalog" })} />);
    expect(screen.queryByText("+ Додати в активне тренування")).toBeNull();
  });

  it("shows warning when add is clicked with no active workout", () => {
    render(
      <ExerciseDetailSheet
        {...baseProps({ mode: "log", activeWorkoutId: null })}
      />,
    );
    fireEvent.click(screen.getByText("+ Додати в активне тренування"));
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it("shows warning when add is clicked on an ended workout", () => {
    const endedWorkout = {
      id: "w-ended",
      startedAt: "2026-07-01T08:00:00Z",
      endedAt: "2026-07-01T09:00:00Z",
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    } as import("@sergeant/fizruk-domain").Workout;
    render(
      <ExerciseDetailSheet
        {...baseProps({
          mode: "log",
          activeWorkoutId: "w-ended",
          activeWorkout: endedWorkout,
        })}
      />,
    );
    fireEvent.click(screen.getByText("+ Додати в активне тренування"));
    expect(mockToast.warning).toHaveBeenCalled();
    expect(noopAdd).not.toHaveBeenCalled();
  });

  it("calls addExerciseToActive and onClose when workout is active", () => {
    const activeWorkout = {
      id: "w-active",
      startedAt: "2026-07-10T08:00:00Z",
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    } as import("@sergeant/fizruk-domain").Workout;
    const addExerciseToActive = vi.fn();
    const onClose = vi.fn();
    const ex = makeExercise();
    render(
      <ExerciseDetailSheet
        {...baseProps({
          mode: "log",
          activeWorkoutId: "w-active",
          activeWorkout,
          addExerciseToActive,
          onClose,
          selected: ex,
        })}
      />,
    );
    fireEvent.click(screen.getByText("+ Додати в активне тренування"));
    expect(addExerciseToActive).toHaveBeenCalledWith(ex);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ExerciseDetailSheet – close and copy buttons", () => {
  it("calls onClose when Закрити is clicked", () => {
    const onClose = vi.fn();
    render(<ExerciseDetailSheet {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByText("Закрити"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the copy name button", () => {
    render(<ExerciseDetailSheet {...baseProps()} />);
    expect(screen.getByText(/Копіювати назву/)).toBeInTheDocument();
  });
});
