// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for AddMealSheet — step flow (source / fill), save validation,
 * backtrack link, and close callback.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddMealSheet } from "./AddMealSheet";

// ─── Mock heavy sub-components ───────────────────────────────────────────────

vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    children,
    title,
    onClose,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: React.ReactNode;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog" data-testid="sheet">
        <div data-testid="sheet-title">{title}</div>
        <button onClick={onClose} aria-label="Закрити">
          ✕
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("./BarcodeScanner", () => ({
  BarcodeScanner: () => <div data-testid="barcode-scanner" />,
}));

vi.mock("./meal-sheet/MealTemplatesRow", () => ({
  MealTemplatesRow: ({ onSelected }: { onSelected: () => void }) => (
    <button data-testid="template-row" onClick={onSelected}>
      Шаблон їжі
    </button>
  ),
}));

vi.mock("./meal-sheet/MealTypePicker", () => ({
  MealTypePicker: () => <div data-testid="meal-type-picker" />,
}));

vi.mock("./meal-sheet/NameTimeRow", () => ({
  NameTimeRow: ({ field }: { field: (key: string) => (v: string) => void }) => (
    <input
      data-testid="name-input"
      placeholder="Назва страви"
      onChange={(e) => field("name")(e.target.value)}
    />
  ),
}));

vi.mock("./meal-sheet/FromPantryRow", () => ({
  FromPantryRow: () => <div data-testid="from-pantry-row" />,
}));

vi.mock("./meal-sheet/FoodPickerSection", () => ({
  FoodPickerSection: () => <div data-testid="food-picker" />,
}));

vi.mock("./meal-sheet/BarcodeSection", () => ({
  BarcodeSection: () => <div data-testid="barcode-section" />,
}));

vi.mock("./meal-sheet/MacrosEditor", () => ({
  MacrosEditor: () => <div data-testid="macros-editor" />,
}));

vi.mock("./meal-sheet/SaveAsFood", () => ({
  SaveAsFood: () => <div data-testid="save-as-food" />,
}));

vi.mock("./meal-sheet/SaveAsTemplate", () => ({
  SaveAsTemplate: () => <div data-testid="save-as-template" />,
}));

// Stable mock references — created via vi.hoisted() so they exist before
// vi.mock() factories run. Returning new vi.fn() inside the factory would
// create NEW function objects on each render call; those land in useEffect
// deps and change identity every render → infinite re-render → OOM.
const { stableFoodSearch, stableBarcodeLookup } = vi.hoisted(() => ({
  stableFoodSearch: {
    foodHits: [] as unknown[],
    offHits: [] as unknown[],
    foodBusy: false,
    offBusy: false,
    foodErr: "",
    setFoodErr: vi.fn(),
  },
  stableBarcodeLookup: {
    barcode: "",
    setBarcode: vi.fn(),
    barcodeStatus: "",
    setBarcodeStatus: vi.fn(),
    scannerOpen: false,
    setScannerOpen: vi.fn(),
    handleBarcodeLookup: vi.fn(),
    handleBarcodeBind: vi.fn(),
  },
}));

vi.mock("./meal-sheet/useFoodSearch", () => ({
  useFoodSearch: vi.fn(() => stableFoodSearch),
}));

vi.mock("./meal-sheet/useBarcodeLookup", () => ({
  useBarcodeLookup: vi.fn(() => stableBarcodeLookup),
}));

vi.mock("./meal-sheet/mealFormUtils", () => ({
  currentTime: vi.fn(() => "12:00"),
  emptyForm: vi.fn(() => ({
    name: "",
    mealType: "breakfast",
    time: "12:00",
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    err: "",
  })),
}));

vi.mock("../lib/mealTypes", () => ({
  MEAL_TYPES: [
    { id: "breakfast", label: "Сніданок" },
    { id: "lunch", label: "Обід" },
    { id: "dinner", label: "Вечеря" },
    { id: "snack", label: "Перекус" },
  ],
}));

vi.mock("../lib/foodDb/foodDb", () => ({
  ensureSeedFoods: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/mealId", () => ({
  newMealId: vi.fn(() => "meal-test-id"),
}));

vi.mock("@sergeant/shared", () => ({
  useVisualKeyboardInset: vi.fn(() => 0),
  isCapacitor: vi.fn(() => false),
}));

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticSuccess: vi.fn(),
}));

// ─── Default props helpers ─────────────────────────────────────────────────

function renderSheet(
  props: Partial<React.ComponentProps<typeof AddMealSheet>> = {},
) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    mealTemplates: [],
  };
  return render(<AddMealSheet {...defaults} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddMealSheet — closed state", () => {
  it("renders nothing when open=false", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });
});

describe("AddMealSheet — source step (with templates)", () => {
  it("shows 'Звідки страва?' heading when opened with templates", () => {
    renderSheet({
      mealTemplates: [
        {
          id: "t1",
          name: "Вівсянка",
          mealType: "breakfast",
          macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
        },
      ],
    });
    expect(screen.getByText("Звідки страва?")).toBeInTheDocument();
  });

  it("shows the food picker and barcode sections in the source step", () => {
    renderSheet({
      mealTemplates: [
        {
          id: "t1",
          name: "Вівсянка",
          mealType: "breakfast",
          macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
        },
      ],
    });
    expect(screen.getByTestId("food-picker")).toBeInTheDocument();
    expect(screen.getByTestId("barcode-section")).toBeInTheDocument();
  });

  it("clicking 'Ввести вручну' advances to fill step", () => {
    renderSheet({
      mealTemplates: [
        {
          id: "t1",
          name: "Вівсянка",
          mealType: "breakfast",
          macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
        },
      ],
    });
    fireEvent.click(screen.getAllByText("Ввести вручну")[0]!);
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.getByText("Додати прийом їжі")).toBeInTheDocument();
  });

  it("selecting a template via MealTemplatesRow advances to fill step", () => {
    renderSheet({
      mealTemplates: [
        {
          id: "t1",
          name: "Вівсянка",
          mealType: "breakfast",
          macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
        },
      ],
    });
    fireEvent.click(screen.getByTestId("template-row"));
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
  });
});

describe("AddMealSheet — fill step (no templates/photoResult/initialMeal)", () => {
  it("auto-starts at fill step when there are no templates, no photo, no initialMeal", () => {
    renderSheet({ mealTemplates: [] });
    // The source step should be skipped — macros editor should be visible
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.getByText("Додати прийом їжі")).toBeInTheDocument();
  });

  it("shows 'Обрати джерело ↑' link when auto-skipped the source step", () => {
    renderSheet({ mealTemplates: [] });
    expect(screen.getByText("Обрати джерело ↑")).toBeInTheDocument();
  });

  it("shows save and cancel buttons", () => {
    renderSheet({ mealTemplates: [] });
    expect(screen.getByText("Зберегти")).toBeInTheDocument();
    expect(screen.getByText("Скасувати")).toBeInTheDocument();
  });

  it("clicking 'Скасувати' calls onClose", () => {
    const onClose = vi.fn();
    renderSheet({ mealTemplates: [], onClose });
    fireEvent.click(screen.getByText("Скасувати"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows error when saving with empty name", async () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByText("Зберегти"));
    await waitFor(() => {
      expect(screen.getByText("Введи назву страви.")).toBeInTheDocument();
    });
  });

  it("backtracking via 'Обрати джерело ↑' returns to source step", () => {
    renderSheet({ mealTemplates: [] });
    // Currently in fill (auto-skipped)
    expect(screen.getByText("Обрати джерело ↑")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Обрати джерело ↑"));
    // Now in source step
    expect(screen.getByText("Звідки страва?")).toBeInTheDocument();
  });
});

describe("AddMealSheet — editing an existing meal", () => {
  it("auto-starts at fill step when initialMeal has an id", () => {
    renderSheet({
      initialMeal: {
        id: "existing-meal-1",
        name: "Гречка",
        mealType: "lunch",
        macros: { kcal: 200, protein_g: 8, fat_g: 2, carbs_g: 40 },
      },
    });
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    // Should NOT show the 'Обрати джерело ↑' link for edited meals
    expect(screen.queryByText("Обрати джерело ↑")).not.toBeInTheDocument();
  });
});
