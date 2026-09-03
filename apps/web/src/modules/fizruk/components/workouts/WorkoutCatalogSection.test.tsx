// @vitest-environment jsdom
/**
 * Tests for WorkoutCatalogSection — the filterable exercise catalog
 * rendered inside Workouts. Covers the search input, the location
 * segmented control, the equipment sheet, empty-state fallback, group
 * accordion toggle, exercise list rendering, recovery warnings, and the
 * ⓘ info button.
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

const noInjury = {
  blocked: false,
  viaMuscles: [],
  viaZones: [],
  coverage: "muscle-and-zone" as const,
};

const noWarning = {
  hasWarning: false,
  hasHardBlock: false,
  red: [],
  yellow: [],
  injury: noInjury,
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
    locationFilter: "gym" as FizrukData.ExerciseLocation,
    setLocationFilter: vi.fn(),
    equipmentUk: {
      barbell: "Штанга",
      dumbbell: "Гантелі",
      machine: "Тренажер",
    },
    equipmentCounts: { barbell: 36, dumbbell: 49, machine: 21 },
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

describe("WorkoutCatalogSection — location filter", () => {
  it("renders one segment per location with gym selected by default", () => {
    render(<WorkoutCatalogSection {...baseProps()} />);
    for (const label of ["Зал", "Дім", "Вулиця"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: "Зал" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects a location on click", () => {
    const setLocationFilter = vi.fn();
    render(<WorkoutCatalogSection {...baseProps({ setLocationFilter })} />);
    fireEvent.click(screen.getByRole("tab", { name: "Дім" }));
    expect(setLocationFilter).toHaveBeenCalledWith("home");
  });

  it("drops equipment the new location cannot host", () => {
    const setEquipmentFilter = vi.fn();
    render(
      <WorkoutCatalogSection
        {...baseProps({
          equipmentFilter: ["barbell", "dumbbell", "machine"],
          setEquipmentFilter,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Вулиця" }));
    const updater = setEquipmentFilter.mock.calls[0]?.[0] as (
      prev: string[],
    ) => string[];
    expect(updater(["barbell", "dumbbell", "machine"])).toEqual(["dumbbell"]);
  });
});

describe("WorkoutCatalogSection — equipment sheet", () => {
  it("counts the kinds that make sense in the current location", () => {
    render(<WorkoutCatalogSection {...baseProps()} />);
    expect(screen.getByText("3 видів")).toBeInTheDocument();
  });

  it("narrows the count outdoors, where the barbell has no place", () => {
    render(
      <WorkoutCatalogSection {...baseProps({ locationFilter: "outdoor" })} />,
    );
    expect(screen.getByText("1 видів")).toBeInTheDocument();
  });

  it("opens the sheet and lists equipment with its own exercise count", () => {
    render(<WorkoutCatalogSection {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /Обладнання/ }));
    expect(screen.getByRole("button", { name: /Штанга/ })).toBeInTheDocument();
    expect(screen.getByText("36", { selector: "span" })).toBeInTheDocument();
  });

  it("toggles a kind from inside the sheet", () => {
    const setEquipmentFilter = vi.fn();
    render(<WorkoutCatalogSection {...baseProps({ setEquipmentFilter })} />);
    fireEvent.click(screen.getByRole("button", { name: /Обладнання/ }));
    fireEvent.click(screen.getByRole("button", { name: /Штанга/ }));
    // Функціональний апдейт: перевіряємо результат, а не форму аргумента.
    const updater = setEquipmentFilter.mock.calls[0]?.[0] as (
      prev: string[],
    ) => string[];
    expect(updater([])).toEqual(["barbell"]);
  });

  it("shows the selected count instead of the kind count", () => {
    render(
      <WorkoutCatalogSection
        {...baseProps({ equipmentFilter: ["barbell"] })}
      />,
    );
    expect(screen.queryByText("3 видів")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("clears the equipment selection with the reset control", () => {
    const setEquipmentFilter = vi.fn();
    const setQ = vi.fn();
    render(
      <WorkoutCatalogSection
        {...baseProps({
          q: "жим",
          equipmentFilter: ["barbell"],
          setEquipmentFilter,
          setQ,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Скинути" }));
    expect(setEquipmentFilter).toHaveBeenCalledWith([]);
    expect(setQ).not.toHaveBeenCalled();
  });

  it("hides the equipment control when equipmentUk is empty", () => {
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

  // Браузерне QA 2026-08-23: запит без збігів показував копію порожнього
  // КАТАЛОГУ («Додай першу через кнопку «+ Додати»»), хоча в каталозі 119
  // вправ — тобто екран радив не те, що треба зробити.
  it("distinguishes 'no matches' from 'catalogue is empty'", () => {
    render(
      <WorkoutCatalogSection {...baseProps({ grouped: [], q: "спина" })} />,
    );
    expect(screen.getByText("Нічого не знайшлось")).toBeInTheDocument();
    expect(screen.getByText(/«спина»/)).toBeInTheDocument();
    expect(screen.queryByText("Поки немає вправ")).not.toBeInTheDocument();
  });

  it("offers to clear the query from the no-matches state", () => {
    const setQ = vi.fn();
    const setEquipmentFilter = vi.fn();
    render(
      <WorkoutCatalogSection
        {...baseProps({ grouped: [], q: "спина", setQ, setEquipmentFilter })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Скинути пошук" }));
    expect(setQ).toHaveBeenCalledWith("");
    expect(setEquipmentFilter).toHaveBeenCalledWith([]);
  });

  it("names the filters when they are the only narrowing", () => {
    render(
      <WorkoutCatalogSection
        {...baseProps({ grouped: [], q: "", equipmentFilter: ["barbell"] })}
      />,
    );
    expect(screen.getByText("Нічого не знайшлось")).toBeInTheDocument();
    expect(screen.getByText(/фільтри/)).toBeInTheDocument();
  });

  it("treats a location filter alone as narrowing", () => {
    render(
      <WorkoutCatalogSection
        {...baseProps({ grouped: [], q: "", locationFilter: "home" })}
      />,
    );
    expect(screen.getByText("Нічого не знайшлось")).toBeInTheDocument();
    expect(screen.queryByText("Поки немає вправ")).not.toBeInTheDocument();
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

  it("shows the info button in log mode and calls setSelected on click", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Деталі вправи" }));
    expect(setSelected).toHaveBeenCalledWith(ex);
  });

  it("hides the info button in catalog mode", () => {
    const grouped = [makeGroup("chest", [makeEx("bench", "Жим лежачи")])];
    render(
      <WorkoutCatalogSection
        {...baseProps({ mode: "catalog", grouped, open: { chest: true } })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Деталі вправи" }),
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
            injury: noInjury,
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
