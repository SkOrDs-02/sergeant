/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  RouterProvider,
  createMemoryRouter,
} from "react-router-dom";

import { RedirectTo } from "./RedirectTo";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}</span>;
}

describe("RedirectTo — declarative navigation shim", () => {
  afterEach(() => cleanup());

  it("replaces the current route with the target path on mount", async () => {
    render(
      <MemoryRouter initialEntries={["/old"]}>
        <Routes>
          <Route path="/old" element={<RedirectTo to="/welcome" />} />
          <Route path="/welcome" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/welcome"),
    );
  });

  it("renders an sr-only polite status while redirecting", () => {
    render(
      <MemoryRouter>
        <RedirectTo to="/welcome" />
      </MemoryRouter>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Перенаправлення…");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  // Регресія ux-10: уже змонтований RedirectTo з тим самим `to` мусить знову
  // вести на ціль, якщо сусідній механізм повернув URL назад (stale
  // `setHubView` → push на «/»). Раніше deps `[navigate, to]` цього не ловили.
  // Продакшн використовує data router (`createBrowserRouter`), де `navigate`
  // стабільний між навігаціями, — тому тут `createMemoryRouter`; у
  // `<MemoryRouter>` `navigate` міняється з location і маскує баг.
  it("re-redirects when something else navigates away while it stays mounted", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <>
              <LocationProbe />
              <RedirectTo to="/welcome" />
            </>
          ),
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/welcome"),
    );

    await act(async () => {
      await router.navigate("/");
    });

    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/welcome"),
    );
  });
});
