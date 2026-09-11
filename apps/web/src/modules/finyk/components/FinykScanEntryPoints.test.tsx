// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@shared/hooks/useToast";

// `auth === null` (за замовчуванням) — той самий стан, у якому опиняється
// цей ізольований тест без `AuthProvider`: компонент читає його як
// "не в проді, вважай авторизованим" (див. коментар у `requireAccount`).
// Один тест нижче підміняє це на справжню анонімну сесію
// (`{ user: null }`), щоб перевірити гейт `onOpenAuth`.
const { useAuthOptionalMock } = vi.hoisted(() => ({
  useAuthOptionalMock: vi.fn((): { user: unknown } | null => null),
}));
vi.mock("../../../core/auth/AuthContext", () => ({
  useAuthOptional: useAuthOptionalMock,
}));

vi.mock("./lazyReceiptSheets", () => ({
  ReceiptScanSheet: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="receipt-scan-sheet">
        <button type="button" onClick={onClose}>
          close-scan
        </button>
      </div>
    ) : null,
  BulkImportSheet: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="bulk-import-sheet">
        <button type="button" onClick={onClose}>
          close-bulk
        </button>
      </div>
    ) : null,
}));

import { FinykScanEntryPoints } from "./FinykScanEntryPoints";
import type { ManualExpenseWriteThroughStorage } from "../hooks/manualExpenseWriteThrough";

/**
 * Аркуш масового імпорту контрольований ззовні (його відкривають два
 * входи: FAB тут і плашка нагадування в Огляді), тож тест тримає той стан
 * так само, як `FinykApp` — інакше перевірявся б не той контракт, який
 * компонент насправді має.
 */
function ControlledEntryPoints({
  onAddExpense,
  storage,
  onOpenAuth,
}: {
  onAddExpense: () => void;
  storage: ManualExpenseWriteThroughStorage;
  onOpenAuth: () => void;
}) {
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  return (
    <FinykScanEntryPoints
      onAddExpense={onAddExpense}
      storage={storage}
      onReceiptLinked={vi.fn()}
      bulkImportOpen={bulkImportOpen}
      onBulkImportOpenChange={setBulkImportOpen}
      onOpenAuth={onOpenAuth}
    />
  );
}

function renderEntryPoints(onAddExpense = vi.fn(), onOpenAuth = vi.fn()) {
  const storage: ManualExpenseWriteThroughStorage = {
    manualExpenses: [],
    addManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ControlledEntryPoints
          onAddExpense={onAddExpense}
          storage={storage}
          onOpenAuth={onOpenAuth}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onAddExpense, onOpenAuth };
}

function openFabMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Додати" }));
}

afterEach(() => {
  useAuthOptionalMock.mockReturnValue(null);
});

describe("FinykScanEntryPoints", () => {
  it("renders the FAB trigger with neither sheet mounted; the fan-menu is closed by default", () => {
    renderEntryPoints();
    expect(screen.getByRole("button", { name: "Додати" })).toBeInTheDocument();
    expect(screen.queryByText("Додати витрату")).not.toBeInTheDocument();
    expect(screen.queryByTestId("receipt-scan-sheet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bulk-import-sheet")).not.toBeInTheDocument();
  });

  it("tapping the FAB expands the fan-menu with all three actions", () => {
    renderEntryPoints();
    openFabMenu();
    expect(screen.getByText("Додати витрату")).toBeInTheDocument();
    expect(screen.getByText("Сканувати чек")).toBeInTheDocument();
    expect(screen.getByText("Додати документи")).toBeInTheDocument();
  });

  it("«Додати витрату» calls onAddExpense directly (no sheet mount)", () => {
    const { onAddExpense } = renderEntryPoints();
    openFabMenu();
    fireEvent.click(screen.getByText("Додати витрату"));
    expect(onAddExpense).toHaveBeenCalled();
    expect(screen.queryByTestId("receipt-scan-sheet")).not.toBeInTheDocument();
  });

  it("«Сканувати чек» mounts ReceiptScanSheet lazily, closing unmounts it", async () => {
    renderEntryPoints();
    openFabMenu();
    fireEvent.click(screen.getByText("Сканувати чек"));
    await waitFor(() =>
      expect(screen.getByTestId("receipt-scan-sheet")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("close-scan"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("receipt-scan-sheet"),
      ).not.toBeInTheDocument(),
    );
  });

  it("«Додати документи» mounts BulkImportSheet lazily, closing unmounts it", async () => {
    renderEntryPoints();
    openFabMenu();
    fireEvent.click(screen.getByText("Додати документи"));
    await waitFor(() =>
      expect(screen.getByTestId("bulk-import-sheet")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("close-bulk"));
    await waitFor(() =>
      expect(screen.queryByTestId("bulk-import-sheet")).not.toBeInTheDocument(),
    );
  });

  // Регресія A1 (аудит 2026-09-11, хвиля 2): `onOpenAuth` був опційним, і
  // `onOpenAuth?.()` тихо не робив нічого, коли shell забував його
  // передати — анонім тапав дію, яка виглядала робочою. `onOpenAuth`
  // тепер обовʼязковий пропс (TS не дає зібрати виклик без обробника);
  // цей тест підтверджує, що анонімний гейт справді його викликає.
  it("анонім, який тапає «Сканувати чек», отримує onOpenAuth — без мовчазного no-op", () => {
    useAuthOptionalMock.mockReturnValue({ user: null });
    const { onOpenAuth } = renderEntryPoints();
    openFabMenu();
    fireEvent.click(screen.getByText("Сканувати чек"));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("receipt-scan-sheet")).not.toBeInTheDocument();
  });

  it("анонім, який тапає «Додати документи», теж отримує onOpenAuth", () => {
    useAuthOptionalMock.mockReturnValue({ user: null });
    const { onOpenAuth } = renderEntryPoints();
    openFabMenu();
    fireEvent.click(screen.getByText("Додати документи"));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("bulk-import-sheet")).not.toBeInTheDocument();
  });
});
