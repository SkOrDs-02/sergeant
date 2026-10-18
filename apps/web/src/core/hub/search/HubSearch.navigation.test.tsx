/** @vitest-environment jsdom */
/**
 * Регресія ux-02 (HubSearch × `useHistoryDismiss`): перехід із пошуку в
 * лінивий маршрут модуля не має скасовуватись відкатом запису історії.
 *
 * Реальні: HubSearch, `useSearchEngine`, `SearchResults`, `useHistoryDismiss`
 * і data router на `window.history` (jsdom). Замоковано лише джерело хітів і
 * вібро-адаптер. Маршрут `/finyk` — `lazy` із затримкою довшою за відкат
 * хука (150 мс), як холодний чанк на saveData/2g: роутер робить
 * `history.push` лише після завантаження чанка.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  type RouterProviderProps,
} from "react-router-dom";
import type { Hit } from "./searchTypes";

const performSearch = vi.hoisted(() => vi.fn<(q: string) => Hit[]>(() => []));
vi.mock("./searchSources", () => ({ performSearch }));
vi.mock("@shared/lib/adapters/haptic", () => ({ hapticTap: vi.fn() }));

import { HubSearch } from "./HubSearch";

const FINYK_HIT: Hit = {
  id: "finyk-open",
  module: "finyk",
  moduleLabel: "Фінанси",
  title: "Фінік лінивий",
  subtitle: "модуль",
  icon: "credit-card",
  target: { kind: "module", moduleId: "finyk" },
  _score: 1,
};

/** Холодний чанк маршруту: довше за `ROLLBACK_DEFER_MS` (150 мс) хука. */
const COLD_CHUNK_MS = 450;
/** Із запасом більше за відкат хука, щоб побачити його наслідок. */
const AFTER_ROLLBACK_MS = 350;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeRouter(chunkDelayMs: number) {
  const router = createBrowserRouter([
    {
      path: "/",
      Component: function Layout() {
        const [searchOpen, setSearchOpen] = useState(true);
        return (
          <>
            {searchOpen ? (
              <HubSearch
                initialQuery="фін"
                onClose={() => setSearchOpen(false)}
                // Те саме, що `useHubNavigation.openModule`: `navigate('/<id>')`.
                onOpenModule={(id) => void router.navigate(`/${id}`)}
              />
            ) : (
              <p data-testid="search-closed">пошук закрито</p>
            )}
            <Outlet />
          </>
        );
      },
      children: [
        { index: true, element: <p data-testid="hub-home">хаб</p> },
        {
          path: "finyk/*",
          lazy: async () => {
            await sleep(chunkDelayMs);
            return { Component: () => <p data-testid="finyk-page">Фінік</p> };
          },
        },
      ],
    },
  ]);
  return router;
}

function mount(router: RouterProviderProps["router"]) {
  return render(<RouterProvider router={router} />);
}

describe("HubSearch → лінивий маршрут модуля (ux-02)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    // jsdom не реалізує `scrollIntoView` (автоскрол активного рядка).
    Element.prototype.scrollIntoView = vi.fn();
    performSearch.mockReturnValue([FINYK_HIT]);
  });
  afterEach(() => cleanup());

  it("холодний чанк: перехід у модуль доходить до кінця, а не скасовується відкатом історії", async () => {
    const router = makeRouter(COLD_CHUNK_MS);
    mount(router);

    fireEvent.click(await screen.findByRole("option", { name: /Фінік/ }));

    // Чанк ще вантажиться — пошук лишається на екрані, а не зникає в нікуди.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");

    expect(await screen.findByTestId("finyk-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/finyk");
    expect(await screen.findByTestId("search-closed")).toBeInTheDocument();

    // Відкат хука спрацьовує через 150 мс після розмонтування пошуку.
    // Після нього адреса має лишитись `/finyk`.
    await sleep(AFTER_ROLLBACK_MS);
    expect(router.state.location.pathname).toBe("/finyk");
    expect(window.location.pathname).toBe("/finyk");
    expect(screen.getByTestId("finyk-page")).toBeInTheDocument();
  });

  it("повторний клік під час завантаження чанка не запускає другу навігацію", async () => {
    const router = makeRouter(COLD_CHUNK_MS);
    const navigate = vi.spyOn(router, "navigate");
    mount(router);

    const option = await screen.findByRole("option", { name: /Фінік/ });
    fireEvent.click(option);
    fireEvent.click(option);

    expect(await screen.findByTestId("finyk-page")).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("прогрітий чанк: пошук закривається після переходу в модуль", async () => {
    const router = makeRouter(0);
    mount(router);

    fireEvent.click(await screen.findByRole("option", { name: /Фінік/ }));

    expect(await screen.findByTestId("finyk-page")).toBeInTheDocument();
    expect(await screen.findByTestId("search-closed")).toBeInTheDocument();
    await sleep(AFTER_ROLLBACK_MS);
    expect(router.state.location.pathname).toBe("/finyk");
  });
});
