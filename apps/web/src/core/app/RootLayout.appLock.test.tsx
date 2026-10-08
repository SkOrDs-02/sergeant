// @vitest-environment jsdom
/**
 * Інтеграційний тест аудиту 2026-10-01, кластери sec-13 і priv-15: під замком
 * застосунку гарячі клавіші оболонки не працюють. Справжні `RootLayout`,
 * `AppLock`, `AppLockProvider` і `useHubKeyboardShortcuts`; PIN лежить у
 * `fake-indexeddb`, тож холодний старт справді приходить у `locked`.
 *
 * Сценарій обходу: фокус іде з прихованого поля PIN на кнопку цифри
 * (`isEditableTarget` вже не рятує), і Ctrl+K відкривав пошук поверх замка.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { http, HttpResponse } from "msw";
import { IDBFactory } from "fake-indexeddb";

import { apiClient } from "@shared/api";
import { ToastProvider } from "@shared/hooks/useToast";
import { CommandPaletteProvider } from "@shared/components/ui/CommandPalette";
import { server } from "../../test/msw/server";
import { AuthProvider } from "../auth/AuthContext";
import { AppLockProvider } from "../security/AppLockContext";
import { clearPinHash, savePinHash } from "../security/lockStorage";
import { useHubShell } from "./HubShellContext";

// Boot-кластери тягнуть sqlite-wasm/IndexedDB; тут не предмет (як в
// `RootLayout.authStates.test.tsx`). `AppLock` лишається справжнім.
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

function ShellProbe() {
  const { shortcutsOpen, ui } = useHubShell();
  return (
    <>
      <div data-testid="shortcuts-open">{String(shortcutsOpen)}</div>
      <div data-testid="search-open">{String(ui.searchOpen)}</div>
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
                      <Route path="*" element={<ShellProbe />} />
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

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

describe("RootLayout × App Lock: гарячі клавіші (sec-13, priv-15)", () => {
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

  it("під замком Ctrl+K з фокусом на кнопці не відкриває пошук, '?' і Ctrl+/ теж нічого не відкривають", async () => {
    await savePinHash("1234");
    renderShell();
    await screen.findByText("Введи PIN");

    // Фокус на кнопці цифри — не поле вводу, `isEditableTarget` не рятує.
    const digit = screen.getByRole("button", { name: "7" });
    digit.focus();
    expect(document.activeElement).toBe(digit);

    const ctrlK = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    digit.dispatchEvent(ctrlK);
    fireEvent.keyDown(digit, { key: "?", shiftKey: true });
    fireEvent.keyDown(digit, { key: "/", ctrlKey: true });

    expect(ctrlK.defaultPrevented).toBe(false);
    expect(screen.getByTestId("search-open")).toHaveTextContent("false");
    expect(screen.getByTestId("shortcuts-open")).toHaveTextContent("false");
    // Замок на місці.
    expect(screen.getByText("Введи PIN")).toBeInTheDocument();
  });

  it("контроль: без PIN той самий Ctrl+K відкриває пошук, як тільки перевірка замка завершилась", async () => {
    renderShell();
    await waitFor(() =>
      expect(screen.queryByTestId("app-lock-checking")).not.toBeInTheDocument(),
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("search-open")).toHaveTextContent("true");
  });
});
