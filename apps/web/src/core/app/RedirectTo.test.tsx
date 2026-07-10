/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

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
});
