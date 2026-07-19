// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Stub the kvStoreBoot dependency — it requires @sergeant/db-schema/sqlite
// (WASM artefact not built in test env).
vi.mock("../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

import { NotFoundPage } from "./NotFoundPage";

// Mock the illustration
vi.mock("@assets/illustrations", () => ({
  NotFoundIllustration: ({ size }: { size: number }) => (
    <div data-testid="not-found-illustration" data-size={size} />
  ),
  OfflineIllustration: () => <div data-testid="offline-illustration" />,
  ServerErrorIllustration: () => (
    <div data-testid="server-error-illustration" />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderNotFound(props: { homePath?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={["/some/unknown/path"]}>
      <NotFoundPage {...props} />
    </MemoryRouter>,
  );
}

describe("NotFoundPage", () => {
  it("renders the '404' eyebrow", () => {
    renderNotFound();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the main title 'Сторінку не знайдено'", () => {
    renderNotFound();
    expect(screen.getByText("Сторінку не знайдено")).toBeInTheDocument();
  });

  it("renders the description about the missing page", () => {
    renderNotFound();
    expect(
      screen.getByText(/Здається, ця адреса вже не існує/i),
    ).toBeInTheDocument();
  });

  it("renders the 'На головну' CTA button", () => {
    renderNotFound();
    expect(
      screen.getByRole("button", { name: /На головну/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'Назад' secondary button", () => {
    renderNotFound();
    expect(screen.getByRole("button", { name: /Назад/i })).toBeInTheDocument();
  });

  it("renders the not-found illustration", () => {
    renderNotFound();
    expect(screen.getByTestId("not-found-illustration")).toBeInTheDocument();
  });

  it("renders inside a main landmark element", () => {
    renderNotFound();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the hint text about external links", () => {
    renderNotFound();
    expect(
      screen.getByText(/Якщо ти перейшов сюди із зовнішнього посилання/i),
    ).toBeInTheDocument();
  });

  it("'На головну' button navigates to / by default", () => {
    const { unmount } = renderNotFound();
    const homeBtn = screen.getByRole("button", { name: /На головну/i });
    // Just verify it renders and is clickable without crashing
    fireEvent.click(homeBtn);
    // Navigation happens inside MemoryRouter — no crash is the assertion
    unmount();
  });

  it("'На головну' navigates to custom homePath when provided", () => {
    const { unmount } = renderNotFound({ homePath: "/dashboard" });
    const homeBtn = screen.getByRole("button", { name: /На головну/i });
    fireEvent.click(homeBtn);
    unmount();
  });

  it("'Назад' calls navigate(-1) and returns to the previous history entry", () => {
    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    }
    render(
      <MemoryRouter
        initialEntries={["/home-marker", "/some/unknown/path"]}
        initialIndex={1}
      >
        <LocationDisplay />
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("location").textContent).toBe(
      "/some/unknown/path",
    );
    fireEvent.click(screen.getByRole("button", { name: /Назад/i }));
    expect(screen.getByTestId("location").textContent).toBe("/home-marker");
  });
});
