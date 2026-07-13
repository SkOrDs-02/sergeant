// @vitest-environment jsdom
//
// audit-08 F12 — NutritionPantryPage page-level test coverage.
//
// NutritionPantryPage is a props-driven wrapper that:
//   • renders a SubTabs segmented-control switching between "items" and "shopping"
//   • shows PantryCard when pantrySubTab === "items"
//   • shows ShoppingListCard when pantrySubTab === "shopping"
//   • wires undo-toast on removeItemAtOrByName
//   • exposes scan-status text when pantryScanStatus is non-empty
//   • opens the scanner on onScanBarcode
import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type { useShoppingList } from "../hooks/useShoppingList";
import type { useToast } from "@shared/hooks/useToast";
import { NutritionPantryPage } from "./NutritionPantryPage";

// ---------------------------------------------------------------------------
// Mock heavy children — we are testing the page's wiring, not child internals.
// ---------------------------------------------------------------------------
vi.mock("../components/PantryCard", () => ({
  PantryCard: ({
    removeItemAtOrByName,
    onScanBarcode,
  }: {
    removeItemAtOrByName: (idx: number, name?: string) => void;
    onScanBarcode: () => void;
  }) => (
    <div data-testid="pantry-card">
      <button onClick={() => removeItemAtOrByName(0, "Молоко")}>
        Видалити Молоко
      </button>
      <button onClick={onScanBarcode}>Сканувати штрих-код</button>
    </div>
  ),
}));

vi.mock("../components/ShoppingListCard", () => ({
  ShoppingListCard: () => <div data-testid="shopping-list-card">Shopping</div>,
}));

// SubTabs is small enough to keep real — it only renders buttons.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePantry(
  override?: Partial<ReturnType<typeof useNutritionPantries>>,
): ReturnType<typeof useNutritionPantries> {
  return {
    pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
    activePantryId: "home",
    setActivePantryId: vi.fn(),
    activePantry: { id: "home", name: "Дім", items: [], text: "" },
    pantryText: "",
    pantryItems: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
    newItemName: "",
    setNewItemName: vi.fn(),
    pantryManagerOpen: false,
    setPantryManagerOpen: vi.fn(),
    pantryForm: { mode: "idle", name: "", err: "" },
    setPantryForm: vi.fn(),
    confirmDeleteOpen: false,
    setConfirmDeleteOpen: vi.fn(),
    itemEdit: { open: false, idx: -1, name: "", qty: "", unit: "", err: "" },
    setItemEdit: vi.fn(),
    upsertItem: vi.fn(),
    removeItem: vi.fn(),
    editItemAt: vi.fn(),
    removeItemAt: vi.fn(),
    beginRenamePantry: vi.fn(),
    beginCreatePantry: vi.fn(),
    beginDeletePantry: vi.fn(),
    onSavePantryForm: vi.fn(),
    onConfirmDeletePantry: vi.fn(),
    onSaveItemEdit: vi.fn(),
    setPantryText: vi.fn(),
    effectiveItems: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
    pantrySummary: "Молоко",
    parsePantry: vi.fn(),
    pantryStorageErr: "",
    consumePantryItem: vi.fn(),
    ...override,
  } as ReturnType<typeof useNutritionPantries>;
}

function makeShopping(
  override?: Partial<ReturnType<typeof useShoppingList>>,
): ReturnType<typeof useShoppingList> {
  return {
    shoppingList: { categories: [] },
    toggle: vi.fn(),
    clearChecked: vi.fn(),
    clearAll: vi.fn(),
    setGeneratedList: vi.fn(),
    checkedItems: [],
    ...override,
  } as ReturnType<typeof useShoppingList>;
}

function makeToast(): ReturnType<typeof useToast> {
  return {
    show: vi.fn(() => 1),
    success: vi.fn(() => 1),
    error: vi.fn(() => 1),
    info: vi.fn(() => 1),
    warning: vi.fn(() => 1),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    toasts: [],
  } as ReturnType<typeof useToast>;
}

function renderPantryPage(
  overrides: {
    pantry?: Partial<ReturnType<typeof useNutritionPantries>>;
    pantrySubTab?: "items" | "shopping";
    pantryScanStatus?: string;
    toast?: ReturnType<typeof useToast>;
    setPantrySubTab?: (id: "items" | "shopping") => void;
    setPantryScanStatus?: Dispatch<SetStateAction<string>>;
    setPantryScannerOpen?: Dispatch<SetStateAction<boolean>>;
  } = {},
) {
  const pantry = makePantry(overrides.pantry);
  const shopping = makeShopping();
  const toast = overrides.toast ?? makeToast();
  const setPantrySubTab = overrides.setPantrySubTab ?? vi.fn();
  const setPantryScanStatus: Dispatch<SetStateAction<string>> =
    overrides.setPantryScanStatus ??
    (vi.fn<(v: SetStateAction<string>) => void>() as Dispatch<
      SetStateAction<string>
    >);
  const setPantryScannerOpen: Dispatch<SetStateAction<boolean>> =
    overrides.setPantryScannerOpen ??
    (vi.fn<(v: SetStateAction<boolean>) => void>() as Dispatch<
      SetStateAction<boolean>
    >);

  render(
    <NutritionPantryPage
      pantry={pantry}
      shopping={shopping}
      recipes={[]}
      weekPlan={null}
      shoppingBusy={false}
      busy={false}
      pantrySubTab={overrides.pantrySubTab ?? "items"}
      setPantrySubTab={setPantrySubTab}
      pantryScanStatus={overrides.pantryScanStatus ?? ""}
      setPantryScanStatus={setPantryScanStatus}
      setPantryScannerOpen={setPantryScannerOpen}
      toast={toast}
      generateShoppingList={vi.fn()}
      addCheckedItemsToPantry={vi.fn()}
    />,
  );

  return {
    pantry,
    shopping,
    toast,
    setPantrySubTab,
    setPantryScanStatus,
    setPantryScannerOpen,
  };
}

afterEach(() => cleanup());

describe("NutritionPantryPage", () => {
  it("renders without crashing — shows SubTabs with Комора and Покупки", () => {
    renderPantryPage();
    expect(screen.getByRole("tab", { name: "Комора" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Покупки" })).toBeTruthy();
  });

  it("shows PantryCard when pantrySubTab is 'items'", () => {
    renderPantryPage({ pantrySubTab: "items" });
    expect(screen.getByTestId("pantry-card")).toBeTruthy();
    expect(screen.queryByTestId("shopping-list-card")).toBeNull();
  });

  it("shows ShoppingListCard when pantrySubTab is 'shopping'", () => {
    renderPantryPage({ pantrySubTab: "shopping" });
    expect(screen.getByTestId("shopping-list-card")).toBeTruthy();
    expect(screen.queryByTestId("pantry-card")).toBeNull();
  });

  it("clicking a SubTab calls setPantrySubTab with the correct id", async () => {
    const setPantrySubTab = vi.fn();
    renderPantryPage({ pantrySubTab: "items", setPantrySubTab });

    await userEvent.click(screen.getByRole("tab", { name: "Покупки" }));
    expect(setPantrySubTab).toHaveBeenCalledWith("shopping");
  });

  it("removeItemAtOrByName on an existing item calls pantry.removeItemAt and fires an undo toast", async () => {
    const removeItemAt = vi.fn();
    const upsertItem = vi.fn();
    const toast = makeToast();

    renderPantryPage({
      pantry: { removeItemAt, upsertItem },
      toast,
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Видалити Молоко/ }),
    );

    expect(removeItemAt).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it("undo inside the toast calls pantry.upsertItem with the removed item", async () => {
    const removeItemAt = vi.fn();
    const upsertItem = vi.fn();
    const toast = makeToast();
    let capturedOnUndo: (() => void) | undefined;

    (toast.show as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg, _type, _dur, action?: { label: string; onClick: () => void }) => {
        capturedOnUndo = action?.onClick;
        return 1;
      },
    );

    renderPantryPage({
      pantry: { removeItemAt, upsertItem },
      toast,
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Видалити Молоко/ }),
    );

    expect(capturedOnUndo).toBeDefined();
    capturedOnUndo!();
    expect(upsertItem).toHaveBeenCalledTimes(1);
  });

  it("scan-status text is rendered when pantryScanStatus is non-empty", () => {
    renderPantryPage({ pantryScanStatus: "Знайдено: Молоко 1 л" });
    expect(screen.getByText("Знайдено: Молоко 1 л")).toBeTruthy();
  });

  it("scan-status text is absent when pantryScanStatus is empty", () => {
    renderPantryPage({ pantryScanStatus: "" });
    expect(screen.queryByText(/Знайдено/)).toBeNull();
  });

  it("clicking 'Сканувати штрих-код' clears scan-status and opens the scanner", async () => {
    const setPantryScanStatus = vi.fn<(v: SetStateAction<string>) => void>();
    const setPantryScannerOpen = vi.fn<(v: SetStateAction<boolean>) => void>();

    renderPantryPage({
      setPantryScanStatus: setPantryScanStatus as Dispatch<
        SetStateAction<string>
      >,
      setPantryScannerOpen: setPantryScannerOpen as Dispatch<
        SetStateAction<boolean>
      >,
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Сканувати штрих-код/ }),
    );

    expect(setPantryScanStatus).toHaveBeenCalledWith("");
    expect(setPantryScannerOpen).toHaveBeenCalledWith(true);
  });

  it("when pantryItems is empty, removeItemAtOrByName falls through to pantry.removeItem by name", async () => {
    const removeItem = vi.fn();
    const removeItemAt = vi.fn();
    const toast = makeToast();

    // pantryItems empty → branch `else if (name) { pantry.removeItem(name) }`
    renderPantryPage({
      pantry: { pantryItems: [], removeItem, removeItemAt },
      toast,
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Видалити Молоко/ }),
    );

    // removeItemAt should NOT be called (pantryItems.length === 0)
    expect(removeItemAt).not.toHaveBeenCalled();
    // removeItem should be called with the name from the stub
    expect(removeItem).toHaveBeenCalledWith("Молоко");
  });
});
