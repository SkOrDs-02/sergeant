/** @vitest-environment jsdom */
/**
 * Unit tests for NutritionOverlays.
 *
 * The component is a pure composition layer — it wires many heavy sub-sheets
 * (PantryManagerSheet, ItemEditSheet, BarcodeScanner, AddMealSheet, dialogs)
 * together through props. We stub every sub-component to a lightweight marker
 * and assert that the orchestration logic (open/close gating, guard conditions
 * for the delete-confirm dialog) works correctly.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

// Stub all heavy sub-components.
vi.mock("./PantryManagerSheet", () => ({
  PantryManagerSheet: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="pantry-manager-sheet">
        <button onClick={onClose}>close-pantry</button>
      </div>
    ) : null,
}));

vi.mock("./ItemEditSheet", () => ({
  ItemEditSheet: ({ itemEdit }: { itemEdit: { open: boolean } }) =>
    itemEdit?.open ? <div data-testid="item-edit-sheet" /> : null,
}));

vi.mock("./BarcodeScanner", () => ({
  BarcodeScanner: ({
    onClose,
  }: {
    onDetected: (b: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="barcode-scanner">
      <button onClick={onClose}>close-scanner</button>
    </div>
  ),
}));

vi.mock("./AddMealSheet", () => ({
  AddMealSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-meal-sheet" /> : null,
}));

vi.mock("@shared/components/ui/InputDialog", () => ({
  InputDialog: ({
    open,
    onCancel,
    title,
  }: {
    open: boolean;
    title: string;
    onCancel: () => void;
    onConfirm: (v: string) => void;
    description?: string;
    type?: string;
    placeholder?: string;
  }) =>
    open ? (
      <div data-testid="input-dialog" data-title={title}>
        <button onClick={onCancel}>cancel-input</button>
      </div>
    ) : null,
}));

vi.mock("@shared/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
    children,
  }: {
    open: boolean;
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children?: ReactNode;
  }) =>
    open ? (
      <div data-testid="confirm-dialog" data-title={title}>
        <button onClick={onConfirm}>confirm</button>
        <button onClick={onCancel}>cancel</button>
        {children}
      </div>
    ) : null,
}));

import { NutritionOverlays } from "./NutritionOverlays";

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makePantry(overrides: Record<string, unknown> = {}) {
  return {
    pantryManagerOpen: false,
    setPantryManagerOpen: vi.fn(),
    pantries: [{ id: "p1", name: "Дім", items: [] }],
    activePantryId: "p1",
    setActivePantryId: vi.fn(),
    pantryForm: { mode: "idle" as const, name: "" },
    setPantryForm: vi.fn(),
    onSavePantryForm: vi.fn(),
    beginCreatePantry: vi.fn(),
    beginRenamePantry: vi.fn(),
    beginDeletePantry: vi.fn(),
    confirmDeleteOpen: false,
    setConfirmDeleteOpen: vi.fn(),
    onConfirmDeletePantry: vi.fn(),
    itemEdit: { open: false, item: null, idx: -1 },
    setItemEdit: vi.fn(),
    onSaveItemEdit: vi.fn(),
    effectiveItems: [],
    consumePantryItem: vi.fn(),
    ...overrides,
  } as never;
}

function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    addMealSheetOpen: false,
    setAddMealSheetOpen: vi.fn(),
    addMealPhotoResult: null,
    setAddMealPhotoResult: vi.fn(),
    ...overrides,
  } as never;
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    pantry: makePantry(),
    log: makeLog(),
    busy: false,
    pantryScannerOpen: false,
    setPantryScannerOpen: vi.fn(),
    handlePantryBarcodeDetected: vi.fn(),
    editingMeal: null,
    setEditingMeal: vi.fn(),
    wrappedSaveMeal: vi.fn(),
    prefs: { mealTemplates: [] } as never,
    setPrefs: vi.fn(),
    backupPasswordDialog: null,
    setBackupPasswordDialog: vi.fn(),
    handleBackupPasswordConfirm: vi.fn(),
    restoreConfirm: null,
    setRestoreConfirm: vi.fn(),
    applyRestorePayload: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NutritionOverlays", () => {
  it("renders without crashing when all sheets are closed", () => {
    const { container } = render(<NutritionOverlays {...baseProps()} />);
    // Fragment root → no single container element
    expect(container).toBeTruthy();
    expect(
      screen.queryByTestId("pantry-manager-sheet"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("barcode-scanner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-meal-sheet")).not.toBeInTheDocument();
  });

  it("shows PantryManagerSheet when pantry.pantryManagerOpen is true", () => {
    render(
      <NutritionOverlays
        {...baseProps({ pantry: makePantry({ pantryManagerOpen: true }) })}
      />,
    );
    expect(screen.getByTestId("pantry-manager-sheet")).toBeInTheDocument();
  });

  it("calls setPantryManagerOpen(false) when PantryManagerSheet close is triggered", () => {
    const setPantryManagerOpen = vi.fn();
    render(
      <NutritionOverlays
        {...baseProps({
          pantry: makePantry({
            pantryManagerOpen: true,
            setPantryManagerOpen,
          }),
        })}
      />,
    );
    fireEvent.click(screen.getByText("close-pantry"));
    expect(setPantryManagerOpen).toHaveBeenCalledWith(false);
  });

  it("shows BarcodeScanner only when pantryScannerOpen is true", () => {
    render(<NutritionOverlays {...baseProps({ pantryScannerOpen: true })} />);
    expect(screen.getByTestId("barcode-scanner")).toBeInTheDocument();
  });

  it("calls setPantryScannerOpen(false) when BarcodeScanner close is triggered", () => {
    const setPantryScannerOpen = vi.fn();
    render(
      <NutritionOverlays
        {...baseProps({ pantryScannerOpen: true, setPantryScannerOpen })}
      />,
    );
    fireEvent.click(screen.getByText("close-scanner"));
    expect(setPantryScannerOpen).toHaveBeenCalledWith(false);
  });

  it("shows AddMealSheet when log.addMealSheetOpen is true", () => {
    render(
      <NutritionOverlays
        {...baseProps({ log: makeLog({ addMealSheetOpen: true }) })}
      />,
    );
    expect(screen.getByTestId("add-meal-sheet")).toBeInTheDocument();
  });

  it("shows InputDialog when backupPasswordDialog is set", () => {
    render(
      <NutritionOverlays
        {...baseProps({
          backupPasswordDialog: {
            title: "Введіть пароль",
            description: "для бекапу",
          },
        })}
      />,
    );
    expect(screen.getByTestId("input-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("input-dialog")).toHaveAttribute(
      "data-title",
      "Введіть пароль",
    );
  });

  it("calls setBackupPasswordDialog(null) when InputDialog is cancelled", () => {
    const setBackupPasswordDialog = vi.fn();
    render(
      <NutritionOverlays
        {...baseProps({
          backupPasswordDialog: {
            title: "Пароль",
            description: "…",
          },
          setBackupPasswordDialog,
        })}
      />,
    );
    fireEvent.click(screen.getByText("cancel-input"));
    expect(setBackupPasswordDialog).toHaveBeenCalledWith(null);
  });

  it("shows restore ConfirmDialog when restoreConfirm is set", () => {
    render(
      <NutritionOverlays
        {...baseProps({
          restoreConfirm: { payload: { version: 1 } },
        })}
      />,
    );
    const dialogs = screen.getAllByTestId("confirm-dialog");
    const restoreDialog = dialogs.find(
      (el) => el.getAttribute("data-title") === "Відновити бекап?",
    );
    expect(restoreDialog).toBeTruthy();
  });

  it("calls applyRestorePayload and setRestoreConfirm(null) on restore confirm", () => {
    const applyRestorePayload = vi.fn();
    const setRestoreConfirm = vi.fn();
    render(
      <NutritionOverlays
        {...baseProps({
          restoreConfirm: { payload: { version: 2 } },
          applyRestorePayload,
          setRestoreConfirm,
        })}
      />,
    );
    // The restore confirm dialog confirm button
    const dialogs = screen.getAllByTestId("confirm-dialog");
    const restoreDialog = dialogs.find(
      (el) => el.getAttribute("data-title") === "Відновити бекап?",
    )!;
    fireEvent.click(
      (restoreDialog.querySelector("button[onClick]") as HTMLElement) ||
        restoreDialog.querySelector("button")!,
    );
    expect(applyRestorePayload).toHaveBeenCalledWith({ version: 2 });
    expect(setRestoreConfirm).toHaveBeenCalledWith(null);
  });

  it("shows delete ConfirmDialog when pantry.confirmDeleteOpen is true", () => {
    render(
      <NutritionOverlays
        {...baseProps({
          pantry: makePantry({ confirmDeleteOpen: true }),
        })}
      />,
    );
    const dialogs = screen.getAllByTestId("confirm-dialog");
    const deleteDialog = dialogs.find(
      (el) => el.getAttribute("data-title") === "Видалити склад?",
    );
    expect(deleteDialog).toBeTruthy();
  });

  it("swallows delete confirm when only one pantry remains (guard)", () => {
    const onConfirmDeletePantry = vi.fn();
    const setConfirmDeleteOpen = vi.fn();
    render(
      <NutritionOverlays
        {...baseProps({
          pantry: makePantry({
            confirmDeleteOpen: true,
            pantries: [{ id: "p1", name: "Дім", items: [] }], // only one
            onConfirmDeletePantry,
            setConfirmDeleteOpen,
          }),
        })}
      />,
    );
    const dialogs = screen.getAllByTestId("confirm-dialog");
    const deleteDialog = dialogs.find(
      (el) => el.getAttribute("data-title") === "Видалити склад?",
    )!;
    fireEvent.click(deleteDialog.querySelector("button")!);
    // Guard: should NOT call actual delete, but should close the dialog
    expect(onConfirmDeletePantry).not.toHaveBeenCalled();
    expect(setConfirmDeleteOpen).toHaveBeenCalledWith(false);
  });

  it("calls onConfirmDeletePantry when multiple pantries exist", () => {
    const onConfirmDeletePantry = vi.fn();
    render(
      <NutritionOverlays
        {...baseProps({
          pantry: makePantry({
            confirmDeleteOpen: true,
            pantries: [
              { id: "p1", name: "Дім", items: [] },
              { id: "p2", name: "Робота", items: [] },
            ],
            onConfirmDeletePantry,
          }),
        })}
      />,
    );
    const dialogs = screen.getAllByTestId("confirm-dialog");
    const deleteDialog = dialogs.find(
      (el) => el.getAttribute("data-title") === "Видалити склад?",
    )!;
    fireEvent.click(deleteDialog.querySelector("button")!);
    expect(onConfirmDeletePantry).toHaveBeenCalledTimes(1);
  });
});
