/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MacroChip } from "./MacroChip";

afterEach(cleanup);

describe("MacroChip", () => {
  it("renders the label, rounded value, and default unit", () => {
    const { getByText } = render(<MacroChip label="Білки" value={24.6} />);
    expect(getByText("Білки")).toBeInTheDocument();
    expect(getByText("25")).toBeInTheDocument();
    expect(getByText("г")).toBeInTheDocument();
  });

  it("rounds the value to the nearest integer", () => {
    const { getByText } = render(<MacroChip label="Жири" value={10.4} />);
    expect(getByText("10")).toBeInTheDocument();
  });

  it("renders an em-dash when value is null", () => {
    const { getByText } = render(<MacroChip label="Вуглеводи" value={null} />);
    expect(getByText("—")).toBeInTheDocument();
  });

  it("renders an em-dash when value is undefined", () => {
    const { getByText } = render(<MacroChip label="Ккал" value={undefined} />);
    expect(getByText("—")).toBeInTheDocument();
  });

  it("renders a custom unit", () => {
    const { getByText } = render(
      <MacroChip label="Ккал" value={500} unit="ккал" />,
    );
    expect(getByText("ккал")).toBeInTheDocument();
  });

  it("renders zero as 0, not as the em-dash fallback", () => {
    const { getByText } = render(<MacroChip label="Цукор" value={0} />);
    expect(getByText("0")).toBeInTheDocument();
  });

  it("merges a custom color class onto the wrapper", () => {
    const { container } = render(
      <MacroChip label="Білки" value={1} color="text-nutrition" />,
    );
    expect(container.firstElementChild!.className).toContain("text-nutrition");
  });
});
