// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Stub the kvStoreBoot dependency — it requires @sergeant/db-schema/sqlite
// (WASM artefact not built in test env).
vi.mock("../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

import { ServerErrorPage } from "./ServerErrorPage";

// Mock the illustration
vi.mock("@assets/illustrations", () => ({
  ServerErrorIllustration: ({ size }: { size: number }) => (
    <div data-testid="server-error-illustration" data-size={size} />
  ),
  OfflineIllustration: () => <div data-testid="offline-illustration" />,
  NotFoundIllustration: () => <div data-testid="not-found-illustration" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ServerErrorPage", () => {
  it("renders the '500' eyebrow", () => {
    render(<ServerErrorPage />);
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("renders the main title 'Щось пішло не так'", () => {
    render(<ServerErrorPage />);
    expect(screen.getByText("Щось пішло не так")).toBeInTheDocument();
  });

  it("renders the description text about reloading", () => {
    render(<ServerErrorPage />);
    expect(
      screen.getByText(/Сервер тимчасово не зміг обробити запит/i),
    ).toBeInTheDocument();
  });

  it("renders 'Оновити сторінку' CTA button", () => {
    render(<ServerErrorPage />);
    expect(
      screen.getByRole("button", { name: /Оновити сторінку/i }),
    ).toBeInTheDocument();
  });

  it("calls onReset when the CTA button is clicked and onReset is provided", () => {
    const onReset = vi.fn();
    render(<ServerErrorPage onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /Оновити сторінку/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("clicking the CTA without onReset does not throw", () => {
    // window.location.reload is not redefinable in jsdom — test that clicking
    // the reload CTA without an onReset prop does not throw a JS exception.
    render(<ServerErrorPage />);
    expect(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Оновити сторінку/i }),
      );
    }).not.toThrow();
  });

  it("renders the server error illustration", () => {
    render(<ServerErrorPage />);
    expect(screen.getByTestId("server-error-illustration")).toBeInTheDocument();
  });

  it("renders inside a main landmark element", () => {
    render(<ServerErrorPage />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the hint text about error repetition", () => {
    render(<ServerErrorPage />);
    expect(screen.getByText(/Якщо помилка повторюється/i)).toBeInTheDocument();
  });
});
