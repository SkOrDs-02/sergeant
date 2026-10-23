// @vitest-environment jsdom
/**
 * Інтеграційний тест рішення власника 2026-10-22 (sec-13, priv-15): під замком
 * дерево розмонтоване, але недописані форми не губляться. Справжні
 * `RootLayout`, `AppLock`, `useFormDraftLifecycle` і справжні форми
 * (`HabitQuickCreateDialog`, `ManualExpenseSheet`); PIN лежить у
 * `fake-indexeddb`, замок вмикає `visibilitychange`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { http, HttpResponse } from "msw";
import { IDBFactory } from "fake-indexeddb";

import { apiClient } from "@shared/api";
import { ToastProvider } from "@shared/hooks/useToast";
import { CommandPaletteProvider } from "@shared/components/ui/CommandPalette";
import { FORM_DRAFT_IDS, peekFormDraft } from "@shared/lib/storage/formDrafts";
import { safeListSSKeys } from "@shared/lib/storage/storage";
import { purgeAppOwnedSessionStorage } from "@shared/lib/storage/purgeLocalData";
import { server } from "../../test/msw/server";
import { AuthProvider } from "../auth/AuthContext";
import { AppLockProvider } from "../security/AppLockContext";
import { clearPinHash, savePinHash } from "../security/lockStorage";
import { ManualExpenseSheet } from "../../modules/finyk/components/ManualExpenseSheet";
import { HabitQuickCreateDialog } from "../../modules/routine/components/HabitQuickCreateDialog";

vi.mock("../../modules/nutrition/hooks/NutritionBootCluster", () => ({
  default: () => null,
}));
vi.mock("../../modules/finyk/hooks/FinykBootCluster", () => ({
  default: () => null,
}));
vi.mock("../../modules/fizruk/hooks/FizrukBootCluster", () => ({
  default: () => null,
}));
vi.mock("../../modules/routine/hooks/RoutineBootCluster", () => ({
  default: () => null,
}));
vi.mock("./useAppEffects", () => ({ useAppEffects: vi.fn() }));

import { RootLayout } from "./RootLayout";

const onExpenseSave = vi.fn();
// Стабільні посилання: закритий аркуш скидає форму в ефекті, чиї залежності
// включають `frequentCategories`, тож дефолтний `[]` на кожен рендер зациклює
// його (у FinykApp пропи стабільні).
const NO_CATEGORIES: never[] = [];

/** Хости повторюють те, що роблять `FinykApp` і `RoutineHabitsPanel`. */
function ExpenseHost() {
  const [open, setOpen] = useState(
    () => peekFormDraft(FORM_DRAFT_IDS.finykManualExpense) !== null,
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open-expense
      </button>
      <ManualExpenseSheet
        keepDraftUnderLock
        frequentCategories={NO_CATEGORIES}
        customCategories={NO_CATEGORIES}
        open={open}
        onClose={() => setOpen(false)}
        onSave={onExpenseSave}
      />
    </>
  );
}

function HabitHost() {
  const [open, setOpen] = useState(
    () => peekFormDraft(FORM_DRAFT_IDS.routineHabit) !== null,
  );
  const [routine, setRoutine] = useState(defaultRoutineState());
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open-habit
      </button>
      <HabitQuickCreateDialog
        open={open}
        routine={routine}
        setRoutine={setRoutine}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function Probe() {
  return (
    <>
      <ExpenseHost />
      <HabitHost />
    </>
  );
}

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={apiClient}>
        <MemoryRouter initialEntries={["/"]}>
          <ToastProvider>
            <CommandPaletteProvider>
              <AuthProvider>
                <AppLockProvider>
                  <Routes>
                    <Route element={<RootLayout />}>
                      <Route path="*" element={<Probe />} />
                    </Route>
                  </Routes>
                </AppLockProvider>
              </AuthProvider>
            </CommandPaletteProvider>
          </ToastProvider>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

async function lockApp() {
  await savePinHash("1234");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await screen.findByText("Введи PIN");
}

async function unlockApp() {
  for (const d of "1234") {
    fireEvent.click(screen.getByRole("button", { name: d }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Відкрити" }));
  await waitFor(() =>
    expect(screen.queryByText("Введи PIN")).not.toBeInTheDocument(),
  );
}

function draftKeys(): string[] {
  return safeListSSKeys().filter((k) => k.includes("formDraft"));
}

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

describe("RootLayout × App Lock: чернетки форм (sec-13, priv-15)", () => {
  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
    window.localStorage.clear();
    window.sessionStorage.clear();
    server.use(
      http.get("*/api/v1/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    );
  });
  afterEach(async () => {
    cleanup();
    await clearPinHash().catch(() => {});
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
    vi.clearAllMocks();
  });

  async function readyShell() {
    renderShell();
    await waitFor(() =>
      expect(screen.queryByTestId("app-lock-checking")).not.toBeInTheDocument(),
    );
  }

  it("ручна витрата: під замком у DOM немає тексту, після розблокування поля відновлені, сабміт стирає чернетку", async () => {
    await readyShell();
    fireEvent.click(screen.getByText("open-expense"));
    fireEvent.change(await screen.findByLabelText("Сума ₴"), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByPlaceholderText("Назва"), {
      target: { value: "Секретна покупка" },
    });

    await lockApp();
    expect(screen.queryByDisplayValue("Секретна покупка")).toBeNull();
    expect(document.body.textContent).not.toContain("Секретна покупка");
    expect(draftKeys()).toHaveLength(1);

    await unlockApp();
    expect(await screen.findByDisplayValue("Секретна покупка")).toBeVisible();
    expect(screen.getByLabelText("Сума ₴")).toHaveValue("250");
    // Відновлення одноразове: чернетку зі сховища забрано.
    expect(draftKeys()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    await waitFor(() => expect(onExpenseSave).toHaveBeenCalledTimes(1));
    expect(onExpenseSave.mock.calls[0]![0]).toMatchObject({
      description: "Секретна покупка",
      amount: 250,
    });
    expect(draftKeys()).toHaveLength(0);
  });

  it("звичка: назва відновлюється після розблокування, а повторне замикання без нової правки чернетки не воскрешає", async () => {
    await readyShell();
    fireEvent.click(screen.getByText("open-habit"));
    const nameInput = await screen.findByPlaceholderText(/Наприклад|Назва/);
    fireEvent.change(nameInput, { target: { value: "Пити воду" } });

    await lockApp();
    expect(document.body.textContent).not.toContain("Пити воду");
    expect(draftKeys()).toHaveLength(1);

    await unlockApp();
    expect(await screen.findByDisplayValue("Пити воду")).toBeInTheDocument();
    expect(draftKeys()).toHaveLength(0);

    // Закрита (скасована) форма при наступному замку нічого не лишає.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Пити воду")).toBeNull(),
    );
    await lockApp();
    expect(draftKeys()).toHaveLength(0);
  });

  it("порожня форма під замком чернетки не лишає", async () => {
    await readyShell();
    fireEvent.click(screen.getByText("open-expense"));
    await screen.findByLabelText("Сума ₴");
    await lockApp();
    expect(draftKeys()).toHaveLength(0);
  });

  it("вихід з акаунта стирає чернетки (purgeAppOwnedSessionStorage)", async () => {
    await readyShell();
    fireEvent.click(screen.getByText("open-expense"));
    fireEvent.change(await screen.findByPlaceholderText("Назва"), {
      target: { value: "Приватне" },
    });
    await lockApp();
    expect(draftKeys()).toHaveLength(1);

    purgeAppOwnedSessionStorage();

    expect(draftKeys()).toHaveLength(0);
  });
});
