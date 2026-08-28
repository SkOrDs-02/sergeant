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

  it("keeps the brand focus ring when accent is omitted (default stays brand)", () => {
    const { getByRole } = render(<Select />);
    const cls = getByRole("combobox").className;
    expect(cls).toContain("focus-visible:border-brand-400");
    expect(cls).toContain("focus-visible:ring-focus/30");
    expect(cls).not.toContain("input-focus-");
  });

  it.each(["finyk", "fizruk", "nutrition", "routine"] as const)(
    "accent='%s' swaps the brand focus classes for input-focus-%s (exactly one ring family)",
    (accent) => {
      const { getByRole } = render(<Select accent={accent} />);
      const cls = getByRole("combobox").className;
      expect(cls).toContain(`input-focus-${accent}`);
      expect(cls).not.toContain("focus-visible:border-brand-400");
      expect(cls).not.toContain("focus-visible:ring-focus/30");
    },
  );

  it("accent='brand' is byte-identical to the omitted default", () => {
    const { getByRole, unmount } = render(<Select accent="brand" />);
    const explicit = getByRole("combobox").className;
    unmount();
    const { getByRole: getByRole2 } = render(<Select />);
    expect(explicit).toBe(getByRole2("combobox").className);
  });

  it("error takes precedence over a module accent — danger ring, no module utility", () => {
    const { getByRole } = render(<Select accent="finyk" error />);
    const cls = getByRole("combobox").className;
    expect(cls).not.toContain("input-focus-finyk");
    expect(cls).toContain("border-danger/70");
    expect(cls).toContain("focus-visible:border-danger");
    expect(cls).toContain("focus-visible:ring-danger/25");
    expect(cls).toContain("focus-visible:ring-2");
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
