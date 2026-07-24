/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Stat } from "./Stat";

afterEach(cleanup);

describe("Stat", () => {
  it("renders label, value, and sublabel", () => {
    const { getByText } = render(
      <Stat label="Вага" value="82 кг" sublabel="+0.4 кг" />,
    );
    expect(getByText("Вага")).toBeInTheDocument();
    expect(getByText("82 кг")).toBeInTheDocument();
    expect(getByText("+0.4 кг")).toBeInTheDocument();
  });

  it("omits the sublabel node when not provided", () => {
    const { container } = render(<Stat label="Вага" value="82 кг" />);
    // Only the SectionHeading + value row — no third (sublabel) child.
    expect(container.firstElementChild!.children.length).toBe(2);
  });

  it("renders an optional leading icon", () => {
    const { getByText } = render(
      <Stat label="Крок" value="120" icon={<span>👣</span>} />,
    );
    expect(getByText("👣")).toBeInTheDocument();
  });

  it("applies the variant's text color class to the value row", () => {
    const { container } = render(
      <Stat label="Бюджет" value="1000" variant="danger" />,
    );
    const valueRow = container.querySelector(".mt-1.flex.items-baseline")!;
    expect(valueRow.className).toContain("text-danger-strong");
  });

  it("maps size to the correct typographic class", () => {
    const { container } = render(<Stat label="X" value="1" size="lg" />);
    const valueRow = container.querySelector(".mt-1.flex.items-baseline")!;
    expect(valueRow.className).toContain("text-style-headline");
  });

  it.each([
    ["left", "text-left"],
    ["center", "text-center"],
    ["right", "text-right"],
  ] as const)("align=%s applies %s to the wrapper", (align, cls) => {
    const { container } = render(<Stat label="X" value="1" align={align} />);
    expect(container.firstElementChild!.className).toContain(cls);
  });

  it("center/right align also justify the value row", () => {
    const { container } = render(<Stat label="X" value="1" align="center" />);
    const valueRow = container.querySelector(".mt-1.flex.items-baseline")!;
    expect(valueRow.className).toContain("justify-center");
  });
});
