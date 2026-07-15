// @vitest-environment jsdom
/**
 * Tests for WorkoutCatalogSection — the filterable exercise catalog
 * rendered inside Workouts. Covers the search input, equipment filter
 * chips, empty-state fallback, group accordion toggle, exercise list
 * rendering, recovery warnings, and the ⓘ info button.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FizrukData } from "@sergeant/fizruk-domain";
import {
  WorkoutCatalogSection,
  type CatalogGroup,
} from "./WorkoutCatalogSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const noWarning = {
  hasWarning: false,
  hasHardBlock: false,
  red: [],
  yellow: [],
};

function makeEx(id: string, nameUk: string): FizrukData.RawExerciseDef {
  return {
    id,
    name: { uk: nameUk, en: id },
    muscles: { primary: ["pec"], secondary: [] },
    equipment: ["barbell"],
  } as unknown as FizrukData.RawExerciseDef;
}

function makeGroup(
  id: string,
  items: FizrukData.RawExerciseDef[],
): CatalogGroup {
  return { id, label: `Група ${id}`, items, total: items.length };
}

function baseProps(
  overrides: Partial<React.ComponentProps<typeof WorkoutCatalogSection>> = {},
) {
  return {
    mode: "catalog" as const,
    q: "",
    setQ: vi.fn(),
    equipmentFilter: [],
    setEquipmentFilter: vi.fn(),
    equipmentUk: { barbell: "Штанга", dumbbell: "Гантелі" },
    grouped: [],
    open: {},
    setOpen: vi.fn(),
    handleExerciseInListClick: vi.fn(),
    setSelected: vi.fn(),
    recoveryConflictsForExercise: vi.fn(() => noWarning),
    rec: { by: {} },
    musclesUk: { pec: "Грудні" },
    ...overrides,
  };
}

describe("WorkoutCatalogSection — search input", () => {
  it("renders the search placeholder", () => {
    render(<WorkoutCatalogSection {...baseProps()} />);
    expect(screen.getByPlaceholderText(/Пошук/)).toBeInTheDocument();
  });

  it("calls setQ when the input changes", () => {
    const setQ = vi.fn();
    render(<WorkoutCatalogSection {...baseProps({ setQ })} />);
    fireEvent.change(screen.getByPlaceholderText(/Пошук/), {
      target: { value: "жим" },
    });
    expect(setQ).toHaveBeenCalledWith("жим");
  });

  it("shows a clear button when q is non-empty and clears on click", () => {
    const setQ = vi.fn();
    render(<WorkoutCatalogSection {...baseProps({ q: "жим", setQ })} />);
    const clearBtn = screen.getByRole("button", { name: "Очистити пошук" });
    fireEvent.click(clearBtn);
    expect(setQ).toHaveBeenCalledWith("");
  });

  it("hides the clear button when q is empty", () => {
    render(<WorkoutCatalogSection {...baseProps({ q: "" })} />);
    expect(
      screen.queryByRole("button", { name: "Очистити пошук" }),
    ).not.toBeInTheDocument();
  });
});

describe("WorkoutCatalogSection — equipment filter", () => {
  it("renders equipment chips from equipmentUk", () => {
    render(<WorkoutCatalogSection {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Штанга" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Гантелі" })).toBeInTheDocument();
  });

  it("clicking a chip calls setEquipmentFilter with the toggled id", () => {
    const setEquipmentFilter = vi.fn();
    render(<WorkoutCatalogSection {...baseProps({ setEquipmentFilter })} />);
    fireEvent.click(screen.getByRole("button", { name: "Штанга" }));
    expect(setEquipmentFilter).toHaveBeenCalledWith(["barbell"]);
  });

  it("shows the 'Скинути' button when a filter is active and resets on click", () => {
    const setEquipmentFilter = vi.fn();
    render(
      <WorkoutCatalogSection
        {...baseProps({
          equipmentFilter: ["barbell"],
          setEquipmentFilter,
        })}
      />,
    );
    const resetBtn = screen.getByRole("button", { name: "Скинути" });
    fireEvent.click(resetBtn);
    expect(setEquipmentFilter).toHaveBeenCalledWith([]);
  });

  it("renders no equipment section when equipmentUk is empty", () => {
    render(<WorkoutCatalogSection {...baseProps({ equipmentUk: {} })} />);
    expect(screen.queryByText("Обладнання")).not.toBeInTheDocument();
  });
});

describe("WorkoutCatalogSection — mode hint", () => {
  it("shows the log mode hint only in log mode", () => {
    const { rerender } = render(
      <WorkoutCatalogSection {...baseProps({ mode: "log" })} />,
    );
    expect(screen.getByText(/Розкрий групу/)).toBeInTheDocument();
    rerender(<WorkoutCatalogSection {...baseProps({ mode: "catalog" })} />);
    expect(screen.queryByText(/Розкрий групу/)).not.toBeInTheDocument();
  });
});

describe("WorkoutCatalogSection — empty state", () => {
  it("renders the EmptyState when grouped is empty", () => {
    render(<WorkoutCatalogSection {...baseProps({ grouped: [] })} />);
    expect(screen.getByText("Поки немає вправ")).toBeInTheDocument();
  });
});

describe("WorkoutCatalogSection — group accordion", () => {
  it("renders the group label", () => {
    const grouped = [makeGroup("chest", [makeEx("bench", "Жим лежачи")])];
    render(<WorkoutCatalogSection {...baseProps({ grouped })} />);
    expect(screen.getByText("Група chest")).toBeInTheDocument();
  });

  it("clicking a collapsed group header calls setOpen", () => {
    const setOpen = vi.fn();
    const grouped = [makeGroup("chest", [makeEx("bench", "Жим лежачи")])];
    render(
      <WorkoutCatalogSection {...baseProps({ grouped, open: {}, setOpen })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Група chest/ }));
    expect(setOpen).toHaveBeenCalled();
  });

  it("exercise name appears when group is expanded", () => {
    const grouped = [makeGroup("chest", [makeEx("bench", "Жим лежачи")])];
    render(
      <WorkoutCatalogSection
        {...baseProps({ grouped, open: { chest: true } })}
      />,
    );
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
  });

  it("clicking an exercise calls handleExerciseInListClick", () => {
    const handleExerciseInListClick = vi.fn();
    const ex = makeEx("bench", "Жим лежачи");
    const grouped = [makeGroup("chest", [ex])];
    render(
      <WorkoutCatalogSection
        {...baseProps({
          grouped,
          open: { chest: true },
          handleExerciseInListClick,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Жим лежачи/ }));
    expect(handleExerciseInListClick).toHaveBeenCalledWith(ex);
  });

  it("shows ⓘ button in log mode and calls setSelected on click", () => {
    const setSelected = vi.fn();
    const ex = makeEx("bench", "Жим лежачи");
    const grouped = [makeGroup("chest", [ex])];
    render(
      <WorkoutCatalogSection
        {...baseProps({
          mode: "log",
          grouped,
          open: { chest: true },
          setSelected,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Опис і фото вправи" }));
    expect(setSelected).toHaveBeenCalledWith(ex);
  });

  it("hides ⓘ button in catalog mode", () => {
    const grouped = [makeGroup("chest", [makeEx("bench", "Жим лежачи")])];
    render(
      <WorkoutCatalogSection
        {...baseProps({ mode: "catalog", grouped, open: { chest: true } })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Опис і фото вправи" }),
    ).not.toBeInTheDocument();
  });

  it("shows a truncation notice when total > items.length", () => {
    const ex = makeEx("bench", "Жим лежачи");
    const grouped = [{ id: "chest", label: "Груди", items: [ex], total: 50 }];
    render(
      <WorkoutCatalogSection
        {...baseProps({ grouped, open: { chest: true } })}
      />,
    );
    expect(screen.getByText(/Показано 1 з 50/)).toBeInTheDocument();
  });
});

describe("WorkoutCatalogSection — recovery warning", () => {
  it("shows ⚠ when recoveryConflictsForExercise returns hasWarning true", () => {
    const ex = makeEx("bench", "Жим лежачи");
    const grouped = [makeGroup("chest", [ex])];
    render(
      <WorkoutCatalogSection
        {...baseProps({
          grouped,
          open: { chest: true },
          recoveryConflictsForExercise: vi.fn(() => ({
            hasWarning: true,
            hasHardBlock: false,
            red: [],
            yellow: [],
          })),
        })}
      />,
    );
    expect(screen.getByTitle("Мʼязи ще відновлюються")).toBeInTheDocument();
  });

  it("hides ⚠ when there is no warning", () => {
    const ex = makeEx("bench", "Жим лежачи");
    const grouped = [makeGroup("chest", [ex])];
    render(
      <WorkoutCatalogSection
        {...baseProps({ grouped, open: { chest: true } })}
      />,
    );
    expect(
      screen.queryByTitle("Мʼязи ще відновлюються"),
    ).not.toBeInTheDocument();
  });
});
