// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { useFinykRoute, useFinykQueryParam } from "./useFinykRoute";

function RouteProbe() {
  const [page, navigate] = useFinykRoute();
  const cat = useFinykQueryParam("cat");
  const location = useLocation();
  return (
    <div>
      <span data-testid="page">{page}</span>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="cat">{cat ?? "none"}</span>
      <button onClick={() => navigate("budgets")}>go-budgets</button>
      <button onClick={() => navigate("unknown-page")}>go-unknown</button>
      <button onClick={() => navigate("budgets")}>go-budgets-again</button>
    </div>
  );
}

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/finyk/*" element={<RouteProbe />} />
        <Route path="*" element={<RouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useFinykRoute", () => {
  it("defaults to overview at the finyk root", () => {
    renderAt("/finyk");
    expect(screen.getByTestId("page")).toHaveTextContent("overview");
  });

  it("reads the page from a path segment", () => {
    renderAt("/finyk/budgets");
    expect(screen.getByTestId("page")).toHaveTextContent("budgets");
  });

  it("falls back to overview for an unknown segment", () => {
    renderAt("/finyk/nonsense");
    expect(screen.getByTestId("page")).toHaveTextContent("overview");
  });

  it("navigates to a typed page", () => {
    renderAt("/finyk");
    fireEvent.click(screen.getByText("go-budgets"));
    expect(screen.getByTestId("page")).toHaveTextContent("budgets");
    expect(screen.getByTestId("path")).toHaveTextContent("/finyk/budgets");
  });

  it("coerces an unknown navigation target back to overview", () => {
    renderAt("/finyk/budgets");
    fireEvent.click(screen.getByText("go-unknown"));
    expect(screen.getByTestId("page")).toHaveTextContent("overview");
    expect(screen.getByTestId("path")).toHaveTextContent("/finyk");
  });

  it("treats a non-finyk pathname as overview", () => {
    renderAt("/something-else");
    expect(screen.getByTestId("page")).toHaveTextContent("overview");
  });
});

describe("useFinykQueryParam", () => {
  it("reads a query param from the current URL", () => {
    renderAt("/finyk/budgets?cat=smoking");
    expect(screen.getByTestId("cat")).toHaveTextContent("smoking");
  });

  it("returns null when the param is absent", () => {
    renderAt("/finyk/budgets");
    expect(screen.getByTestId("cat")).toHaveTextContent("none");
  });
});
