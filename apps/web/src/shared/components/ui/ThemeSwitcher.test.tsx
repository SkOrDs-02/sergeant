// @vitest-environment jsdom
/**
 * Tests for `ThemeSwitcher` — segmented + dropdown surfaces over `useTheme`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
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
});

describe("ThemeSwitcher — dropdown", () => {
  it("renders a closed trigger by default", () => {
    render(<ThemeSwitcher variant="dropdown" />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the menu on trigger click and lists all choices", () => {
    render(<ThemeSwitcher variant="dropdown" />);
    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getByRole("menu", { name: "Вибір теми" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(4);
  });

  it("selecting an item updates the theme and closes the menu", () => {
    render(<ThemeSwitcher variant="dropdown" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Темна/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("closes on Escape", () => {
    render(<ThemeSwitcher variant="dropdown" />);
    fireEvent.click(screen.getByRole("button"));
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on outside mousedown", () => {
    render(<ThemeSwitcher variant="dropdown" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
