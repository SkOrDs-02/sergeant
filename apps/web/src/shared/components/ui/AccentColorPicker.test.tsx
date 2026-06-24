/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  renderHook,
  act,
} from "@testing-library/react";
import {
  AccentColorPicker,
  AccentColorPickerCard,
  useAccentColor,
  type AccentColor,
} from "./AccentColorPicker";

const ACCENT_COLOR_KEY = "sergeant_accent_color_v1";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});
afterEach(cleanup);

describe("AccentColorPicker", () => {
  it("renders one button per color with name as aria-label", () => {
    render(<AccentColorPicker />);
    expect(screen.getByRole("button", { name: "Смарагд" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Синій" })).toBeInTheDocument();
  });

  it("marks the selected color with aria-pressed and shows the check icon", () => {
    const { container } = render(<AccentColorPicker value="blue" />);
    const selected = screen.getByRole("button", { name: "Синій" });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    const others = screen.getByRole("button", { name: "Смарагд" });
    expect(others.getAttribute("aria-pressed")).toBe("false");
    // The check icon (svg) only appears inside the selected swatch.
    expect(selected.querySelector("svg")).not.toBeNull();
    expect(container).toBeTruthy();
  });

  it("calls onChange with the full color object on click", () => {
    const onChange = vi.fn();
    render(<AccentColorPicker onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Бірюза" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({
      id: "teal",
      name: "Бірюза",
    });
  });

  it("renders labels when showLabels is set", () => {
    render(<AccentColorPicker showLabels />);
    // Label text appears in addition to aria-label.
    const swatch = screen.getByRole("button", { name: "Помаранч" });
    expect(swatch.textContent).toContain("Помаранч");
  });

  it("supports a custom colors list", () => {
    const custom: AccentColor[] = [
      { id: "x", name: "Custom", hsl: "0 0% 0%", preview: "#000000" },
    ];
    render(<AccentColorPicker colors={custom} />);
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Смарагд" })).toBeNull();
  });
});

describe("useAccentColor", () => {
  it("defaults to emerald and writes the id + CSS vars to the document root", () => {
    const { result } = renderHook(() => useAccentColor());
    expect(result.current.accentId).toBe("emerald");
    expect(result.current.accent?.id).toBe("emerald");
    expect(localStorage.getItem(ACCENT_COLOR_KEY)).toContain("emerald");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "158 64% 52%",
    );
    // Derived light/dark variants are set too.
    expect(
      document.documentElement.style.getPropertyValue("--accent-light"),
    ).not.toBe("");
  });

  it("setAccent switches the active accent and persists it", () => {
    const { result } = renderHook(() => useAccentColor());
    act(() => {
      result.current.setAccent(result.current.colors[2]!); // blue
    });
    expect(result.current.accentId).toBe("blue");
    expect(localStorage.getItem(ACCENT_COLOR_KEY)).toContain("blue");
  });

  it("reset returns to emerald", () => {
    const { result } = renderHook(() => useAccentColor());
    act(() => result.current.setAccent(result.current.colors[3]!)); // violet
    expect(result.current.accentId).toBe("violet");
    act(() => result.current.reset());
    expect(result.current.accentId).toBe("emerald");
  });

  it("reads the persisted accent on first mount", () => {
    localStorage.setItem(ACCENT_COLOR_KEY, "rose");
    const { result } = renderHook(() => useAccentColor());
    expect(result.current.accentId).toBe("rose");
    expect(result.current.accent?.name).toBe("Троянда");
  });
});

describe("AccentColorPickerCard", () => {
  it("renders heading, current color name and embeds the picker", () => {
    render(<AccentColorPickerCard />);
    expect(screen.getByText("Акцентний колір")).toBeInTheDocument();
    expect(screen.getByText(/Поточний:/)).toBeInTheDocument();
    // Picker buttons are present.
    expect(screen.getByRole("button", { name: "Смарагд" })).toBeInTheDocument();
  });

  it("selecting a swatch updates the current-color label", () => {
    render(<AccentColorPickerCard />);
    fireEvent.click(screen.getByRole("button", { name: "Лайм" }));
    expect(screen.getByText("Поточний: Лайм")).toBeInTheDocument();
  });
});
