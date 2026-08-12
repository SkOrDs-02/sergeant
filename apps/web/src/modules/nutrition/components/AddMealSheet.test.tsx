// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for AddMealSheet — step flow (source / fill), save validation,
 * backtrack link, and close callback.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
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
  BarcodeScanner: ({
    onDetected,
    onClose,
  }: {
    onDetected: (raw: string) => Promise<void>;
    onClose: () => void;
  }) => (
    <div data-testid="barcode-scanner">
      <button
        type="button"
        data-testid="scan-detect"
        onClick={() => void onDetected("1234567890")}
      >
        Scan
      </button>
      <button type="button" data-testid="scan-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
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
  FromPantryRow: ({
    setFromPantryItem,
  }: {
    setFromPantryItem: (v: string | null) => void;
  }) => (
    <div data-testid="from-pantry-row">
      <button
        type="button"
        data-testid="pick-pantry"
        onClick={() => setFromPantryItem("Молоко")}
      >
        З комори
      </button>
    </div>
  ),
}));

vi.mock("./meal-sheet/FoodPickerSection", () => ({
  FoodPickerSection: ({
    setPickedFood,
  }: {
    setPickedFood: (
      f: {
        id: string;
        name: string;
        brand?: string;
      } | null,
    ) => void;
  }) => (
    <div data-testid="food-picker">
      <button
        type="button"
        data-testid="pick-food"
        onClick={() =>
          setPickedFood({ id: "food-1", name: "Банан", brand: "Chiquita" })
        }
      >
        Обрати продукт
      </button>
    </div>
  ),
}));

vi.mock("./meal-sheet/BarcodeSection", () => ({
  BarcodeSection: () => <div data-testid="barcode-section" />,
}));

vi.mock("./meal-sheet/MacrosEditor", () => ({
  MacrosEditor: ({
    field,
  }: {
    field: (key: string) => (v: string) => void;
  }) => (
    <div data-testid="macros-editor">
      <input
        data-testid="kcal-input"
        aria-label="Калорії"
        onChange={(e) => field("kcal")(e.target.value)}
      />
      <input
        data-testid="protein-input"
        aria-label="Білки"
        onChange={(e) => field("protein_g")(e.target.value)}
      />
    </div>
  ),
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
    barcodeNotice: null,
    setBarcodeNotice: vi.fn(),
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

vi.mock("@sergeant/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sergeant/shared")>();
  return {
    ...actual,
    useVisualKeyboardInset: vi.fn(() => 0),
    isCapacitor: vi.fn(() => false),
  };
});

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
  stableBarcodeLookup.scannerOpen = false;
  stableBarcodeLookup.barcode = "";
});

describe("AddMealSheet — closed state", () => {
  it("renders nothing when open=false", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });
});

describe("AddMealSheet — source step (with templates)", () => {
  it("keeps recent meals in the add flow and closes after one-tap repeat", () => {
    const onQuickAddMeal = vi.fn();
    const onClose = vi.fn();
    renderSheet({
      onClose,
      onQuickAddMeal,
      quickChips: [
        {
          id: "recent-1",
          label: "Сирна запіканка",
          grams: 250,
          source: "recent-meal",
          lastUsedAt: "2026-08-12T18:00:00.000Z",
          macros: { kcal: 350, protein_g: 12, fat_g: 6, carbs_g: 60 },
        },
      ],
    });

    expect(screen.getByText("Нещодавні прийоми")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Додати Сирна запіканка — 250 грамів",
      }),
    );
    expect(onQuickAddMeal).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

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
    expect(screen.getAllByText("Ввести вручну")).toHaveLength(1);
    fireEvent.click(screen.getByText("Ввести вручну"));
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

  it("shows 'Обрати джерело' link when auto-skipped the source step", () => {
    renderSheet({ mealTemplates: [] });
    expect(screen.getByText("Обрати джерело")).toBeInTheDocument();
  });

  it("shows save and cancel buttons", () => {
    renderSheet({ mealTemplates: [], setPrefs: vi.fn() });
    expect(
      screen.getByRole("button", { name: "Додати прийом" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Запам’ятати для повтору" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Скасувати")).toBeInTheDocument();
  });

  it("adds the meal and remembers one reusable whole-meal template", async () => {
    const onSave = vi.fn();
    const setPrefs = vi.fn();
    renderSheet({ mealTemplates: [], onSave, setPrefs });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Сирна запіканка" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "350" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Запам’ятати для повтору" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Додати прийом" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(setPrefs).toHaveBeenCalledTimes(1);
    const updater = setPrefs.mock.calls[0]![0];
    const next = updater({ mealTemplates: [] });
    expect(next.mealTemplates).toHaveLength(1);
    expect(next.mealTemplates[0]).toMatchObject({
      name: "Сирна запіканка",
      macros: { kcal: 350, protein_g: null, fat_g: null, carbs_g: null },
    });
  });

  it("clicking 'Скасувати' calls onClose", () => {
    const onClose = vi.fn();
    renderSheet({ mealTemplates: [], onClose });
    fireEvent.click(screen.getByText("Скасувати"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows error when saving with empty name", async () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => {
      expect(screen.getByText("Введи назву страви.")).toBeInTheDocument();
    });
  });

  it("backtracking via 'Обрати джерело' returns to source step", () => {
    renderSheet({ mealTemplates: [] });
    // Currently in fill (auto-skipped)
    expect(screen.getByText("Обрати джерело")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Обрати джерело"));
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
    // Should NOT show the 'Обрати джерело' link for edited meals
    expect(screen.queryByText("Обрати джерело")).not.toBeInTheDocument();
  });

  it("preserves foodId from initialMeal when saving an edit", async () => {
    const onSave = vi.fn();
    renderSheet({
      onSave,
      initialMeal: {
        id: "existing-meal-1",
        name: "Гречка",
        mealType: "lunch",
        foodId: "food-db-99",
        amount_g: 150,
        macros: { kcal: 200, protein_g: 8, fat_g: 2, carbs_g: 40 },
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: "existing-meal-1",
      foodId: "food-db-99",
      amount_g: 150,
      macroSource: "productDb",
    });
  });
});

describe("AddMealSheet — photoResult import", () => {
  it("opens at fill step and uses photo dish name on save", async () => {
    // Note: `mealFormUtils` is mocked above so `emptyForm` always returns
    // empty macro strings regardless of `photoResult.macros` — mirrors the
    // "AI couldn't read macros from the photo" case, so saving routes
    // through the empty-macro confirm step (see the dedicated describe
    // block below for that flow's own coverage).
    const onSave = vi.fn();
    renderSheet({
      onSave,
      photoResult: {
        dishName: "Борщ",
        macros: { kcal: 250, protein_g: 10, fat_g: 5, carbs_g: 30 },
      },
    });
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.queryByText("Обрати джерело")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Зберегти" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Борщ",
      source: "photo",
      macroSource: "photoAI",
    });
  });
});

describe("AddMealSheet — save validation branches", () => {
  it("saves directly (no confirm) when macros are entered", async () => {
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Суп" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "350" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Суп",
      source: "manual",
      macroSource: "manual",
      macros: { kcal: 350 },
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("приймає кому як десятковий роздільник (баг бета-тестера 2026-08-10)", async () => {
    // `inputMode="decimal"` на UA-розкладці дає кому, а `Number("1212,1")`
    // це `NaN` — форма відхиляла цілком коректний ввід. Перевіряємо всі
    // чотири поля разом: падали вони однаково.
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Лаови" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "1212,1" },
    });
    fireEvent.change(screen.getByTestId("protein-input"), {
      target: { value: "121,1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      macros: { kcal: 1212.1, protein_g: 121.1 },
    });
    expect(
      screen.queryByText("Некоректне значення КБЖВ."),
    ).not.toBeInTheDocument();
  });

  it("shows macro validation error for negative kcal", async () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Суп" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "-5" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => {
      expect(screen.getByText("Некоректне значення КБЖВ.")).toBeInTheDocument();
    });
  });
});

describe("AddMealSheet — empty-macro confirm step", () => {
  it("shows a confirm dialog instead of saving when all macros are empty", async () => {
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Суп" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(screen.getByText("Зберегти без калорійності?")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("proceeds with the save when the confirm dialog is confirmed", async () => {
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Суп" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Зберегти" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Суп",
      macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the sheet open and does not save when the confirm dialog is cancelled", async () => {
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Суп" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Повернутись" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
    // The sheet itself is still open — the name we typed is still there.
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });
});

describe("AddMealSheet — source step branches", () => {
  const template = {
    id: "t1",
    name: "Вівсянка",
    mealType: "breakfast" as const,
    macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
  };

  it("shows pantry row when pantryItems are provided", () => {
    renderSheet({
      mealTemplates: [template],
      pantryItems: [
        {
          name: "Молоко",
          qty: 1,
          unit: "л",
          notes: null,
        },
      ],
    });
    expect(screen.getByTestId("from-pantry-row")).toBeInTheDocument();
  });

  it("calls onRequestPhoto when photo button is clicked", () => {
    const onRequestPhoto = vi.fn();
    renderSheet({
      mealTemplates: [template],
      onRequestPhoto,
    });
    expect(screen.getByText("Фото")).toBeInTheDocument();
    expect(screen.queryByText("Сфотографувати страву")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Додати страву з фото"));
    expect(onRequestPhoto).toHaveBeenCalledTimes(1);
  });

  it("auto-advances to fill when a food is picked", () => {
    renderSheet({ mealTemplates: [template] });
    fireEvent.click(screen.getByTestId("pick-food"));
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.getByText("Додати прийом їжі")).toBeInTheDocument();
  });

  it("auto-advances to fill when a pantry item is picked", () => {
    renderSheet({
      mealTemplates: [template],
      pantryItems: [
        {
          name: "Молоко",
          qty: 1,
          unit: "л",
          notes: null,
        },
      ],
    });
    fireEvent.click(screen.getByTestId("pick-pantry"));
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
  });

  it("shows back arrow after manual forward navigation from source", () => {
    renderSheet({ mealTemplates: [template] });
    fireEvent.click(screen.getByText("Ввести вручну"));
    expect(
      screen.getByLabelText("Назад до вибору джерела"),
    ).toBeInTheDocument();
  });

  it("back arrow returns to source step", () => {
    renderSheet({ mealTemplates: [template] });
    fireEvent.click(screen.getByText("Ввести вручну"));
    fireEvent.click(screen.getByLabelText("Назад до вибору джерела"));
    expect(screen.getByText("Звідки страва?")).toBeInTheDocument();
  });
});

describe("AddMealSheet — pantry consume on save", () => {
  it("calls onConsumePantryItem when saving a pantry-sourced meal", async () => {
    const onConsumePantryItem = vi.fn();
    const onSave = vi.fn();
    const template = {
      id: "t1",
      name: "Вівсянка",
      mealType: "breakfast" as const,
      macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
    };
    renderSheet({
      mealTemplates: [template],
      pantryItems: [
        {
          name: "Молоко",
          qty: 1,
          unit: "л",
          notes: null,
        },
      ],
      onConsumePantryItem,
      onSave,
    });
    fireEvent.click(screen.getByTestId("pick-pantry"));
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "120" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onConsumePantryItem).toHaveBeenCalledWith("Молоко", 100);
    expect(onSave.mock.calls[0]![0].name).toBe("Молоко");
  });

  it("defers pantry consumption until the empty-macro confirm is accepted", async () => {
    const onConsumePantryItem = vi.fn();
    const onSave = vi.fn();
    const template = {
      id: "t1",
      name: "Вівсянка",
      mealType: "breakfast" as const,
      macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
    };
    renderSheet({
      mealTemplates: [template],
      pantryItems: [
        {
          name: "Молоко",
          qty: 1,
          unit: "л",
          notes: null,
        },
      ],
      onConsumePantryItem,
      onSave,
    });
    fireEvent.click(screen.getByTestId("pick-pantry"));
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(onConsumePantryItem).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Зберегти" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onConsumePantryItem).toHaveBeenCalledWith("Молоко", 100);
  });
});

describe("AddMealSheet — barcode scanner overlay", () => {
  it("renders BarcodeScanner when scannerOpen is true", () => {
    stableBarcodeLookup.scannerOpen = true;
    renderSheet({ mealTemplates: [] });
    expect(screen.getByTestId("barcode-scanner")).toBeInTheDocument();
  });

  it("invokes barcode lookup when scanner detects a code", async () => {
    stableBarcodeLookup.scannerOpen = true;
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByTestId("scan-detect"));
    await waitFor(() => {
      expect(stableBarcodeLookup.setScannerOpen).toHaveBeenCalledWith(false);
      expect(stableBarcodeLookup.setBarcode).toHaveBeenCalledWith("1234567890");
      expect(stableBarcodeLookup.handleBarcodeLookup).toHaveBeenCalledWith(
        "1234567890",
      );
    });
  });
});
