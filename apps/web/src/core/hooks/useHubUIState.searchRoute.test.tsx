// @vitest-environment jsdom
/**
 * Пошук хаба лишався відкритим поверх модуля після тапу по хіту (кадри
 * Фініка, 2026-11-18). `searchOpen` живе в `useHubUIState` на рівні
 * `RootLayout`, а `useCloseAfterNavigation` — усередині самого пошуку на
 * головній. Зміна адреси розмонтовує головну разом із пошуком у тому ж
 * коміті, тож ефект, що мав викликати `onClose`, не виконувався, а
 * `ModuleShell` рендерив власні `HubModals` з досі відкритим `searchOpen`.
 *
 * Тест відтворює саме цю форму дерева: стан у layout-і, що не
 * розмонтовується, пошук із `useCloseAfterNavigation` лише в елементі
 * маршруту, модуль — окремий маршрут, що читає той самий стан. Керування —
 * лише кнопками в дереві.
 */
import { afterEach, describe, it, expect } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createContext, useContext } from "react";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { useHubUIState, type HubUIState } from "./useHubUIState";
import { useCloseAfterNavigation } from "../hub/search/useCloseAfterNavigation";

const UiCtx = createContext<HubUIState | null>(null);
const useUi = () => useContext(UiCtx)!;

/** Layout, що не розмонтовується: спільний стан + керування. */
function Layout() {
  const ui = useHubUIState();
  const navigate = useNavigate();
  return (
    <UiCtx.Provider value={ui}>
      <span data-testid="state">{ui.searchOpen ? "open" : "closed"}</span>
      <button type="button" onClick={() => ui.setSearchOpen(true)}>
        open
      </button>
      <button
        type="button"
        onClick={() => {
          // Як `openSearchFromShortcut` у RootLayout: з модуля на хаб і
          // одразу відкрити пошук, ще до коміту навігації.
          void navigate("/");
          ui.openSearch("");
        }}
      >
        hub-and-open
      </button>
      <button
        type="button"
        onClick={() => window.history.pushState({ marker: 1 }, "")}
      >
        history-marker
      </button>
      <Outlet />
    </UiCtx.Provider>
  );
}

/** Пошук: тап по хіту = закрити ПІСЛЯ навігації, потім перейти. */
function FakeSearch({ to }: { to: string }) {
  const ui = useUi();
  const navigate = useNavigate();
  // Так само, як справжній пошук: `HubModals` → `HubSearch` → `useSearchEngine`.
  const { closeAfterNavigation } = useCloseAfterNavigation(
    ui.closeSearch,
    ui.closeSearchAfterNavigation,
  );
  return (
    <button
      type="button"
      onClick={() => {
        closeAfterNavigation();
        void navigate(to);
      }}
    >
      hit
    </button>
  );
}

/** Екран зі «своїм» пошуком (головна чи модуль). */
function Screen({ name, to }: { name: string; to: string }) {
  const ui = useUi();
  return (
    <div>
      <span data-testid="screen">{name}</span>
      {ui.searchOpen && <FakeSearch to={to} />}
    </div>
  );
}

// Різні типи компонентів на маршрутах, як `HubHomeView` і `ModuleShell`:
// зміна маршруту розмонтовує попередній екран разом із його пошуком.
function HubPage() {
  return <Screen name="hub" to="/fizruk" />;
}
function FizrukPage() {
  return <Screen name="fizruk" to="/finyk" />;
}
function FinykPage() {
  return <Screen name="finyk" to="/" />;
}

function renderTree(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HubPage />} />
          <Route path="/fizruk" element={<FizrukPage />} />
          <Route path="/finyk" element={<FinykPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const click = (name: string) =>
  act(() => screen.getByRole("button", { name }).click());
const state = () => screen.getByTestId("state").textContent;

afterEach(() => cleanup());

describe("useHubUIState — пошук закривається після своєї навігації", () => {
  it("тап по хіту на головній: модуль відкривається без пошуку поверх", () => {
    renderTree("/");
    click("open");
    expect(state()).toBe("open");
    click("hit");
    expect(screen.getByTestId("screen")).toHaveTextContent("fizruk");
    expect(state()).toBe("closed");
    expect(screen.queryByRole("button", { name: "hit" })).toBeNull();
  });

  it("поки адреса не змінилась (холодний чанк), пошук лишається відкритим", () => {
    renderTree("/");
    click("open");
    // Запис історії пошуку (`useHistoryDismiss`) іде повз роутер.
    click("history-marker");
    expect(state()).toBe("open");
    expect(screen.getByRole("button", { name: "hit" })).toBeInTheDocument();
  });

  it("хіт пошуку, відкритого в модулі, веде в інший модуль без пошуку поверх, і пошук відкривається знову", () => {
    renderTree("/fizruk");
    click("open");
    click("hit");
    expect(screen.getByTestId("screen")).toHaveTextContent("finyk");
    expect(state()).toBe("closed");
    // Наміру «закрити після навігації» більше немає: відкриття працює.
    click("open");
    expect(state()).toBe("open");
  });

  it("перехід, ініційований не пошуком (Ctrl+K з модуля → хаб), пошук не закриває", () => {
    renderTree("/fizruk");
    click("hub-and-open");
    expect(screen.getByTestId("screen")).toHaveTextContent("hub");
    expect(state()).toBe("open");
  });
});
