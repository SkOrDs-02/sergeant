/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MacroBarRow, type MacroItem } from "./MacroBarRow";

afterEach(cleanup);

describe("MacroBarRow", () => {
  it("renders nothing for an empty macros array", () => {
    const { container } = render(<MacroBarRow macros={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one row per macro with label and default value/unit format", () => {
    const macros: MacroItem[] = [
      { label: "Білки", value: 40, max: 120, accent: "nutrition", unit: "г" },
      { label: "Жири", value: 20, max: 60, accent: "warning", unit: "г" },
    ];
    const { getByText } = render(<MacroBarRow macros={macros} />);
    expect(getByText("Білки")).toBeInTheDocument();
    expect(getByText("40 / 120 г")).toBeInTheDocument();
    expect(getByText("20 / 60 г")).toBeInTheDocument();
  });

  it("omits the unit suffix when unit is not provided", () => {
    const macros: MacroItem[] = [
      { label: "Kcal", value: 500, max: 2000, accent: "routine" },
    ];
    const { getByText } = render(<MacroBarRow macros={macros} />);
    expect(getByText("500 / 2000")).toBeInTheDocument();
  });

  it("uses valueDisplay override when provided", () => {
    const macros: MacroItem[] = [
      {
        label: "Вуглеводи",
        value: 100,
        max: 150,
        accent: "routine",
        valueDisplay: "48 г до цілі",
      },
    ];
    const { getByText } = render(<MacroBarRow macros={macros} />);
    expect(getByText("48 г до цілі")).toBeInTheDocument();
  });

  it("clamps progress percentage and safe-guards a zero/negative max", () => {
    const macros: MacroItem[] = [
      { label: "X", value: 999, max: 0, accent: "nutrition" },
    ];
    const { container } = render(<MacroBarRow macros={macros} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuemax")).toBe("1");
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    const fill = bar.querySelector("div")!;
    expect(fill.getAttribute("style")).toContain("width: 100%");
  });

  it("applies the accent's track/fill classes", () => {
    const macros: MacroItem[] = [
      { label: "X", value: 1, max: 2, accent: "warning" },
    ];
    const { container } = render(<MacroBarRow macros={macros} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.className).toContain("bg-warning/15");
    expect(bar.querySelector("div")!.className).toContain("bg-warning");
  });

  it("merges a custom className on the list", () => {
    const macros: MacroItem[] = [
      { label: "X", value: 1, max: 2, accent: "nutrition" },
    ];
    const { container } = render(
      <MacroBarRow macros={macros} className="extra" />,
    );
    expect(container.querySelector("ul")!.className).toContain("extra");
  });
});
