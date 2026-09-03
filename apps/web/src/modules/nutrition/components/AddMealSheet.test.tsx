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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  // Керований мок: тести мусять бачити тип прийому у формі, щоб ловити
  // його мовчазне скидання при відмові від джерела.
  MealTypePicker: ({
    mealType,
    setForm,
  }: {
    mealType: string;
    setForm: (updater: (s: Record<string, unknown>) => unknown) => void;
  }) => (
    <div data-testid="meal-type-picker">
      <span data-testid="meal-type-value">{mealType}</span>
      <button
        type="button"
        data-testid="set-meal-type-dinner"
        onClick={() => setForm((s) => ({ ...s, mealType: "dinner" }))}
      >
        Вечеря
      </button>
    </div>
  ),
}));

vi.mock("./meal-sheet/NameTimeRow", () => ({
  // Контрольований інпут: тести мусять бачити, що саме лежить у формі —
  // зокрема після скидання значень, засіяних джерелом.
  NameTimeRow: ({
    form,
    field,
  }: {
    form: { name: string };
    field: (key: string) => (v: string) => void;
  }) => (
    <input
      data-testid="name-input"
      placeholder="Назва страви"
      value={form.name}
      onChange={(e) => field("name")(e.target.value)}
    />
  ),
}));

vi.mock("./meal-sheet/FromPantryRow", () => ({
  FromPantryRow: ({
    setFromPantryItem,
    setForm,
  }: {
    setFromPantryItem: (v: string | null) => void;
    setForm: (updater: (s: Record<string, unknown>) => unknown) => void;
  }) => (
    <div data-testid="from-pantry-row">
      <button
        type="button"
        data-testid="pick-pantry"
        onClick={() => {
          setFromPantryItem("Молоко");
          // Дзеркалить реальний `FromPantryRow`: він сіє назву у форму.
          setForm((s) => ({ ...s, name: "Молоко", err: "" }));
        }}
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

// Секція штрихкоду замокана вузько: назовні виводимо лише два виходи з
// картки «Продукт не знайдено», бо саме їхня СИМЕТРІЯ і була дефектом —
// «Сфотографувати страву» вела на вкладку, а «Ввести вручну» лише
// закривала картку й лишала людину на порожньому «Скані».
vi.mock("./meal-sheet/BarcodeSection", () => ({
  BarcodeSection: ({
    onUsePhotoForBarcode,
    onManualEntryForBarcode,
  }: {
    onUsePhotoForBarcode?: () => void;
    onManualEntryForBarcode?: () => void;
  }) => (
    <div data-testid="barcode-section">
      <button type="button" onClick={() => onUsePhotoForBarcode?.()}>
        notice-use-photo
      </button>
      <button type="button" onClick={() => onManualEntryForBarcode?.()}>
        notice-manual-entry
      </button>
    </div>
  ),
}));

// PhotoStep owns usePhotoAnalysis + the Premium gate + PaywallModal — its
// internals are covered by PhotoAnalyzeCard tests; here we only exercise
// the step wiring: entering the step and applying a result to the form.
vi.mock("./meal-sheet/PhotoStep", () => ({
  PhotoStep: ({
    onApply,
  }: {
    onApply: (
      result: { dishName: string; macros: Record<string, number | null> },
      file: File | null,
    ) => void;
  }) => (
    <div data-testid="photo-step">
      <button
        type="button"
        data-testid="apply-photo"
        onClick={() =>
          onApply(
            {
              dishName: "Борщ",
              macros: { kcal: 250, protein_g: 10, fat_g: 5, carbs_g: 30 },
            },
            new File(["img"], "borsch.png", { type: "image/png" }),
          )
        }
      >
        Зберегти в журнал
      </button>
    </div>
  ),
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

vi.mock("./meal-sheet/PackageEntryStep", () => ({
  PackageEntryStep: ({
    onCreated,
  }: {
    onCreated: (
      product: { id: string; name: string; per100?: unknown },
      grams: string,
    ) => void;
  }) => (
    <div data-testid="package-step">
      <button
        type="button"
        data-testid="create-package-food"
        onClick={() =>
          onCreated(
            {
              id: "food-9",
              name: "Равіолі",
              per100: { kcal: 250, protein_g: 9, fat_g: 6, carbs_g: 40 },
            },
            "250",
          )
        }
      >
        Далі
      </button>
    </div>
  ),
}));

vi.mock("./meal-sheet/PickedFoodCard", () => ({
  PickedFoodCard: ({
    pickedGrams,
    setPickedGrams,
    onChangeProduct,
  }: {
    pickedGrams: string;
    setPickedGrams: (v: string) => void;
    onChangeProduct: () => void;
  }) => (
    <div data-testid="picked-food-card">
      <span data-testid="picked-grams">{pickedGrams}</span>
      {/* Справжня картка дає стерти й обнулити вагу (текстове поле на
          fine-pointer). Без цих кнопок мок показував вагу, але не давав
          її змінити — і шлях «нульова вага → збереження» був невидимий
          для тестів. */}
      <button
        type="button"
        data-testid="clear-grams"
        onClick={() => setPickedGrams("")}
      >
        Стерти вагу
      </button>
      <button
        type="button"
        data-testid="zero-grams"
        onClick={() => setPickedGrams("0")}
      >
        Нульова вага
      </button>
      <button
        type="button"
        data-testid="change-product"
        onClick={onChangeProduct}
      >
        Обрати інший продукт
      </button>
    </div>
  ),
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
  // Аркуш редагування піднімає звʼязаний продукт за `foodId`
  // (`useEditedFoodRehydration`). `null` = продукту в базі немає, тобто
  // поведінка цих тестів лишається тією, що була до відновлення: картка
  // продукту не рендериться, збережені макроси ніхто не чіпає.
  getFoodById: vi.fn(() => Promise.resolve(null)),
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

// `FromReceiptRow` — єдина дитина аркуша, що ходить у React Query (чеки
// Сільпо), і вона НЕ мокається: так тест лишається чесним щодо контракту
// props, які `SearchTabPanel` їй передає. Без звʼязаної інтеграції рядок
// рендерить null, тож провайдера з `retry: false` достатньо.
function QueryWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSheet(
  props: Partial<React.ComponentProps<typeof AddMealSheet>> = {},
) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    mealTemplates: [],
  };
  return render(<AddMealSheet {...defaults} {...props} />, {
    wrapper: QueryWrapper,
  });
}

// Крок джерела — смужка вкладок, тож обидва ручні режими живуть під
// «Своє». Типовий режим там — «з упаковки», тому шлях до нього коротший
// на один тап, ніж до разової страви.
function openManualTab() {
  fireEvent.click(screen.getByRole("tab", { name: /Своє/ }));
}

function goToWholeMeal() {
  openManualTab();
  fireEvent.click(screen.getByRole("radio", { name: /Готова страва/ }));
  fireEvent.click(screen.getByRole("button", { name: "Далі" }));
}

function renderManualSheet(
  props: Partial<React.ComponentProps<typeof AddMealSheet>> = {},
) {
  const view = renderSheet(props);
  goToWholeMeal();
  return view;
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
        name: "Додати Сирна запіканка 250 грамів",
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

  it("розводить пошук і штрихкод по різних вкладках", () => {
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
    // «Пошук» — типова вкладка: саме нею додають більшість прийомів.
    expect(screen.getByTestId("food-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("barcode-section")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    expect(screen.getByTestId("barcode-section")).toBeInTheDocument();
    expect(screen.queryByTestId("food-picker")).toBeNull();
  });

  it("clicking 'Готова страва' advances to fill step", () => {
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
    goToWholeMeal();
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.getByText("Додати прийом їжі")).toBeInTheDocument();
  });

  // Регресія на дефект, який знайшла тестерка 2026-08-22: у ручному вводі
  // ніде не було сказано, в якій одиниці КБЖВ, і людина з упаковкою в
  // руках вводила значення з етикетки (на 100 г) у поля «за всю порцію».
  // Тепер це два явні режими, і кожен підписаний своєю одиницею.
  it("пропонує два ручні режими з різними одиницями КБЖВ", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    // Підпис одиниці — на самому перемикачі: різниця між режимами саме в
    // ній, і побачити її треба ДО того, як вводити числа.
    expect(screen.getByRole("radio", { name: /З упаковки/ })).toHaveTextContent(
      "на 100 г",
    );
    expect(
      screen.getByRole("radio", { name: /Готова страва/ }),
    ).toHaveTextContent("за всю порцію");
  });

  it("«З упаковки» — типовий режим вкладки й показується одразу в ній", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    // Поля етикетки рендеряться ПРЯМО у вкладці, без переходу на окремий
    // крок: заради цього вкладки й робились — менше стрибків маршрутом.
    expect(screen.getByTestId("package-step")).toBeInTheDocument();
    expect(screen.getByText("Звідки страва?")).toBeInTheDocument();
    expect(screen.queryByTestId("macros-editor")).not.toBeInTheDocument();
  });

  it("створений з упаковки продукт приходить на fill із вагою порції", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.getByTestId("picked-food-card")).toBeInTheDocument();
    expect(screen.getByTestId("picked-grams")).toHaveTextContent("250");
  });

  // Контракт збереження, а не лише навігація: режим «з упаковки» мусить
  // лягти в журнал як productDb + foodId + вага порції, інакше зміна в
  // `handleSave` тихо переверне походження даних.
  it("зберігає прийом з упаковки як productDb із вагою порції", () => {
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Равіолі" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "625" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати прийом" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      macroSource: "productDb",
      foodId: "food-9",
      amount_g: 250,
    });
  });

  // Регресія: `gramsOrDefault` підставляє 100 для нуля й порожнього поля,
  // а `PickedFoodCard` навмисно не перераховує КБЖВ під нульову вагу —
  // разом це давало запис «100 г» із числами, порахованими під 250 г.
  it.each([
    ["стерту", "clear-grams"],
    ["нульову", "zero-grams"],
  ])("не зберігає прийом під %s вагу порції", (_label, testId) => {
    const onSave = vi.fn();
    renderSheet({ mealTemplates: [], onSave });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Равіолі" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "625" },
    });
    fireEvent.click(screen.getByTestId(testId));
    fireEvent.click(screen.getByRole("button", { name: "Додати прийом" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  // Тип прийому й час — вибір людини, а не джерела: відмова від продукту
  // не має відкочувати їх на «зараз».
  it("зберігає обраний тип прийому при зміні продукту", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    fireEvent.click(screen.getByTestId("set-meal-type-dinner"));
    fireEvent.click(screen.getByTestId("change-product"));
    goToWholeMeal();
    expect(screen.getByTestId("meal-type-value")).toHaveTextContent("dinner");
  });

  // Комора сіє `form.name`; відмова від неї не має лишати чужу назву на
  // ручному записі.
  it("скидає назву, засіяну коморою, при поверненні до вибору джерела", () => {
    renderSheet({
      mealTemplates: [],
      pantryItems: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
    });
    fireEvent.click(screen.getByTestId("pick-pantry"));
    fireEvent.click(screen.getByLabelText("Назад до вибору джерела"));
    goToWholeMeal();
    expect(screen.getByTestId("name-input")).toHaveValue("");
  });

  // Те саме правило, що й для комори: своє не чіпаємо. Продукт сіє назву
  // через `PickedFoodCard`, тож у моці робимо це руками.
  it("лишає назву, яку людина переписала після продукту", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Мій обід" },
    });
    fireEvent.click(screen.getByTestId("change-product"));
    goToWholeMeal();
    expect(screen.getByTestId("name-input")).toHaveValue("Мій обід");
  });

  it("чистить назву, засіяну продуктом, якщо людина її не міняла", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Равіолі" },
    });
    fireEvent.click(screen.getByTestId("change-product"));
    goToWholeMeal();
    expect(screen.getByTestId("name-input")).toHaveValue("");
  });

  it("лишає назву, яку людина переписала після комори", () => {
    renderSheet({
      mealTemplates: [],
      pantryItems: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
    });
    fireEvent.click(screen.getByTestId("pick-pantry"));
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Молочний коктейль" },
    });
    fireEvent.click(screen.getByLabelText("Назад до вибору джерела"));
    goToWholeMeal();
    expect(screen.getByTestId("name-input")).toHaveValue("Молочний коктейль");
  });

  it("«Готова страва» підписує одиницю і дає перехід до режиму етикетки", () => {
    renderSheet({ mealTemplates: [] });
    goToWholeMeal();
    expect(
      screen.getByText(/Значення – за всю порцію, як зʼїв, а не на 100 г/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("picked-food-card")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Маю етикетку на 100 г" }),
    );
    expect(screen.getByTestId("package-step")).toBeInTheDocument();
  });

  // Раніше картка ваги жила у `FoodPickerSection` на кроці «source», а
  // аркуш перемикається на «fill» у тому ж рендері, у якому зʼявляється
  // `pickedFood` — тож вона розмонтовувалась, не встигнувши показатись,
  // і порція назавжди лишалась типовою.
  it("показує вагу порції на fill після вибору продукту з пошуку", () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByTestId("pick-food"));
    expect(screen.getByTestId("picked-food-card")).toBeInTheDocument();
  });

  it("«обрати інший продукт» повертає на крок джерела без звʼязку", () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByTestId("pick-food"));
    fireEvent.click(screen.getByTestId("change-product"));
    expect(screen.getByText("Звідки страва?")).toBeInTheDocument();
    expect(screen.queryByTestId("picked-food-card")).not.toBeInTheDocument();
  });

  // Числа, засіяні продуктом (на 100 г × вага), не мають дожити до
  // «Готової страви», де ті самі поля означають «за всю порцію».
  it("скидає засіяні продуктом КБЖВ при поверненні до вибору джерела", () => {
    renderSheet({ mealTemplates: [] });
    openManualTab();
    fireEvent.click(screen.getByTestId("create-package-food"));
    // Реальна `PickedFoodCard` засіває назву й КБЖВ із картки продукту —
    // тут вона змокана, тож те саме робимо руками.
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Равіолі" },
    });
    expect(screen.getByTestId("name-input")).toHaveValue("Равіолі");

    fireEvent.click(screen.getByLabelText("Назад до вибору джерела"));
    goToWholeMeal();
    expect(screen.getByTestId("name-input")).toHaveValue("");
  });

  it("не показує підказку про одиницю при редагуванні наявного прийому", () => {
    renderSheet({
      mealTemplates: [],
      initialMeal: {
        id: "m1",
        name: "Суп",
        mealType: "lunch",
        time: "13:00",
        macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 40 },
      },
    });
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
    expect(screen.queryByText(/Значення – за всю порцію/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Маю етикетку на 100 г" }),
    ).toBeNull();
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
  it("starts at source step even when there are no templates or recent meals", () => {
    renderSheet({ mealTemplates: [] });
    expect(screen.getByText("Звідки страва?")).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "Звідки страва" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("macros-editor")).not.toBeInTheDocument();
  });

  it("shows save and cancel buttons", () => {
    renderManualSheet({ mealTemplates: [], setPrefs: vi.fn() });
    expect(
      screen.getByRole("button", { name: "Додати прийом" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Запамʼятати для повтору" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Скасувати")).toBeInTheDocument();
  });

  it("adds the meal and remembers one reusable whole-meal template", async () => {
    const onSave = vi.fn();
    const setPrefs = vi.fn();
    renderManualSheet({ mealTemplates: [], onSave, setPrefs });
    fireEvent.change(screen.getByTestId("name-input"), {
      target: { value: "Сирна запіканка" },
    });
    fireEvent.change(screen.getByTestId("kcal-input"), {
      target: { value: "350" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Запамʼятати для повтору" }),
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
    renderManualSheet({ mealTemplates: [], onClose });
    fireEvent.click(screen.getByText("Скасувати"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows error when saving with empty name", async () => {
    renderManualSheet({ mealTemplates: [] });
    fireEvent.click(
      screen.getByRole("button", { name: /Додати прийом|Зберегти зміни/ }),
    );
    await waitFor(() => {
      expect(screen.getByText("Введи назву страви.")).toBeInTheDocument();
    });
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

describe("AddMealSheet — photo step", () => {
  it("initialStep='photo' opens straight at the photo step", () => {
    renderSheet({ initialStep: "photo" });
    expect(screen.getByTestId("photo-step")).toBeInTheDocument();
    expect(screen.queryByTestId("macros-editor")).not.toBeInTheDocument();
  });

  it("applying a photo result advances to fill and saves with photoAI semantics", async () => {
    // Note: `mealFormUtils` is mocked above so `emptyForm` always returns
    // empty macro strings regardless of the applied macros — mirrors the
    // "AI couldn't read macros from the photo" case, so saving routes
    // through the empty-macro confirm step (see the dedicated describe
    // block below for that flow's own coverage).
    const onSave = vi.fn();
    renderSheet({ onSave, initialStep: "photo" });
    fireEvent.click(screen.getByTestId("apply-photo"));
    expect(screen.getByTestId("macros-editor")).toBeInTheDocument();
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
    // Оригінал фото їде разом зі стравою — з нього host зробить мініатюру.
    expect(onSave.mock.calls[0]![1]).toBeInstanceOf(File);
  });

  it("backtracking from fill after a photo apply drops photoAI semantics", async () => {
    // Користувач застосував фото, повернувся на «Звідки страва?» і ввів
    // вручну — страва не має зберегти macroSource: photoAI, а форма не має
    // тягти AI-засіяні значення.
    //
    // Скидання перевіряємо ПО СТАНУ поля назви, а не по виклику
    // `emptyForm(null)`: скидання більше не перебудовує весь стан форми
    // (це затирало б обраний людиною тип прийому й час), а чистить рівно
    // засіяні джерелом поля.
    const onSave = vi.fn();
    const { emptyForm } = await import("./meal-sheet/mealFormUtils");
    renderSheet({ onSave, initialStep: "photo", mealTemplates: [] });
    fireEvent.click(screen.getByTestId("apply-photo"));
    expect(vi.mocked(emptyForm)).toHaveBeenLastCalledWith(
      expect.objectContaining({ dishName: "Борщ" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Назад до вибору джерела" }),
    );
    goToWholeMeal();
    expect(screen.getByTestId("name-input")).toHaveValue("");
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
    });
  });
});

describe("AddMealSheet — save validation branches", () => {
  it("saves directly (no confirm) when macros are entered", async () => {
    const onSave = vi.fn();
    renderManualSheet({ mealTemplates: [], onSave });
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
    renderManualSheet({ mealTemplates: [], onSave });
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
    renderManualSheet({ mealTemplates: [] });
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
    renderManualSheet({ mealTemplates: [], onSave });
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
    renderManualSheet({ mealTemplates: [], onSave });
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
    renderManualSheet({ mealTemplates: [], onSave });
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

  it("opens the in-sheet photo step when the photo button is clicked", () => {
    // Крок фото — всередині sheet-а: без закриття, навігації на «Огляд» і
    // синтетичного кліку по file input (старий onRequestPhoto-маршрут).
    renderSheet({ mealTemplates: [template] });
    fireEvent.click(screen.getByRole("tab", { name: /Фото/ }));
    expect(screen.getByTestId("photo-step")).toBeInTheDocument();
    // Вихід — це вже не стрілка «назад», а сусідня вкладка: крок джерела
    // ми не покидали, тож і повертатись нема звідки.
    fireEvent.click(screen.getByRole("tab", { name: /Пошук/ }));
    expect(screen.queryByTestId("photo-step")).not.toBeInTheDocument();
    expect(screen.getByTestId("food-picker")).toBeInTheDocument();
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
    goToWholeMeal();
    expect(
      screen.getByLabelText("Назад до вибору джерела"),
    ).toBeInTheDocument();
  });

  it("back arrow returns to source step", () => {
    renderSheet({ mealTemplates: [template] });
    goToWholeMeal();
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

describe("AddMealSheet — вкладка «Скан» сама відкриває сканер", () => {
  // Обрана вкладка «Скан» — це вже намір сканувати. Просити після неї ще
  // один тап по «Сканувати» означає пропонувати дію, яку людина щойно
  // зробила; кнопка в секції лишається як «Сканувати ще раз».
  it("відкриває сканер одразу при переході на вкладку", () => {
    renderSheet({ mealTemplates: [] });
    expect(stableBarcodeLookup.setScannerOpen).not.toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    expect(stableBarcodeLookup.setScannerOpen).toHaveBeenCalledWith(true);
  });

  it("не відкриває сканер повторно, поки вкладка не змінилась", () => {
    // Без ref-гарда закритий сканер відчинявся б назад на кожному
    // ре-рендері, і вийти з вкладки стало б неможливо.
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    const countOpens = () =>
      stableBarcodeLookup.setScannerOpen.mock.calls.filter(
        (call: unknown[]) => call[0] === true,
      ).length;
    const opens = countOpens();
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    expect(countOpens()).toBe(opens);
  });

  it("повторне відкриття аркуша не кидає в камеру після вкладки «Скан»", () => {
    // Стан аркуша переживає закриття, тож без скидання вкладки людина,
    // яка минулого разу вийшла зі «Скану», при наступному відкритті
    // одразу опинялась би в камері — без жодного жесту з її боку.
    const props = {
      onClose: vi.fn(),
      onSave: vi.fn(),
      mealTemplates: [],
    };
    const view = render(<AddMealSheet {...props} open />, {
      wrapper: QueryWrapper,
    });
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    expect(stableBarcodeLookup.setScannerOpen).toHaveBeenCalledWith(true);

    view.rerender(<AddMealSheet {...props} open={false} />);
    stableBarcodeLookup.setScannerOpen.mockClear();
    view.rerender(<AddMealSheet {...props} open />);

    expect(screen.getByRole("tab", { name: /Пошук/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(stableBarcodeLookup.setScannerOpen).not.toHaveBeenCalledWith(true);
  });

  it("відкриває сканер знову після повернення на вкладку", () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Пошук/ }));
    stableBarcodeLookup.setScannerOpen.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    expect(stableBarcodeLookup.setScannerOpen).toHaveBeenCalledWith(true);
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

/**
 * Регресія вкладок: обидва виходи з картки «Продукт не знайдено» мусять
 * вести на вкладку, а не лише той, що про фото.
 *
 * «Сфотографувати страву» працювала від початку, «Ввести вручну» — ні:
 * вона тільки закривала картку, і людина лишалась на «Скані» з самою
 * кнопкою «Сканувати ще раз» (звіт власника 2026-08-24). Саме контраст
 * між двома сусідніми кнопками й виказав дефект.
 */
describe("AddMealSheet — виходи з картки «Продукт не знайдено»", () => {
  const selectedTab = () =>
    screen
      .getAllByRole("tab")
      .filter((t) => t.getAttribute("aria-selected") === "true")
      .map((t) => t.textContent?.trim())
      .join("");

  it("«Сфотографувати страву» веде на вкладку «Фото»", () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    fireEvent.click(screen.getByText("notice-use-photo"));
    expect(selectedTab()).toMatch(/Фото/);
  });

  it("«Ввести вручну» веде на вкладку «Своє», а не в порожній «Скан»", () => {
    renderSheet({ mealTemplates: [] });
    fireEvent.click(screen.getByRole("tab", { name: /Скан/ }));
    fireEvent.click(screen.getByText("notice-manual-entry"));
    expect(selectedTab()).toMatch(/Своє/);
    expect(selectedTab()).not.toMatch(/Скан/);
  });
});
