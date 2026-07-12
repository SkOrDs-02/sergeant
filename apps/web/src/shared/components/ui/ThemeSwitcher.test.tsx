// @vitest-environment jsdom
/**
 * Tests for `ThemeSwitcher` — the segmented control over `useTheme`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ThemeSwitcher } from "./ThemeSwitcher";

function setSystemDark(dark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? dark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: globalThis.matchMedia,
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  setSystemDark(false);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = "";
});

describe("ThemeSwitcher — segmented (default)", () => {
  it("renders a radiogroup with one radio per theme choice", () => {
    render(<ThemeSwitcher />);
    const group = screen.getByRole("radiogroup", { name: "Тема" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4); // light / dark / system / hc
  });

  it("marks the active choice with aria-checked", () => {
    render(<ThemeSwitcher />);
    // default choice = system
    const sys = screen.getByRole("radio", { name: "Системна" });
    expect(sys).toHaveAttribute("aria-checked", "true");
  });

  it("switches theme on radio click and applies the dark class", () => {
    render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole("radio", { name: "Темна" }));
    expect(screen.getByRole("radio", { name: "Темна" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("shows a caption under each icon (round-2 UI audit X4)", () => {
    render(<ThemeSwitcher />);
    expect(screen.getByText("Світла")).toBeInTheDocument();
    expect(screen.getByText("Темна")).toBeInTheDocument();
    expect(screen.getByText("Системна")).toBeInTheDocument();
    expect(screen.getByText("Контраст")).toBeInTheDocument();
  });
});
