/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { Select } from "./Select";

afterEach(cleanup);

describe("Select", () => {
  it("renders its children as <option> elements", () => {
    const { getByRole } = render(
      <Select>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    const select = getByRole("combobox") as HTMLSelectElement;
    expect(select.options.length).toBe(2);
  });

  it("defaults to size='md' and variant='default'", () => {
    const { getByRole } = render(<Select />);
    const select = getByRole("combobox");
    expect(select.className).toContain("h-11");
    expect(select.className).toContain("bg-panelHi");
  });

  it("applies the requested size class", () => {
    const { getByRole } = render(<Select size="lg" />);
    expect(getByRole("combobox").className).toContain("h-12");
  });

  it("applies the requested variant class", () => {
    const { getByRole } = render(<Select variant="ghost" />);
    expect(getByRole("combobox").className).toContain("hover:bg-panelHi");
  });

  it("sets aria-invalid and the danger border when error=true", () => {
    const { getByRole } = render(<Select error />);
    const select = getByRole("combobox");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.className).toContain("border-danger/70");
  });

  it("does not set aria-invalid when error is falsy", () => {
    const { getByRole } = render(<Select />);
    expect(getByRole("combobox").hasAttribute("aria-invalid")).toBe(false);
  });

  it("forwards a ref to the native <select>", () => {
    const ref = createRef<HTMLSelectElement>();
    render(<Select ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });

  it("merges a custom className", () => {
    const { getByRole } = render(<Select className="my-select" />);
    expect(getByRole("combobox").className).toContain("my-select");
  });

  it("renders the decorative caret svg as aria-hidden", () => {
    const { container } = render(<Select />);
    expect(container.querySelector("svg[aria-hidden]")).not.toBeNull();
  });
});
