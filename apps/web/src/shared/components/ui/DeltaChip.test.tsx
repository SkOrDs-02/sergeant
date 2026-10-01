/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeltaChip } from "./DeltaChip";

describe("DeltaChip", () => {
  it("нічого не рендерить, коли обидва періоди нульові", () => {
    const { container } = render(<DeltaChip cur={0} prev={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("показує «—» замість відсотка при рості від нуля", () => {
    render(<DeltaChip cur={5} prev={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("нульова дельта — «без змін» без стрілки і без зеленого", () => {
    render(<DeltaChip cur={3} prev={3} />);
    const flat = screen.getByTestId("delta-chip-flat");
    expect(flat).toHaveTextContent("без змін");
    expect(flat.querySelector("svg")).toBeNull();
    expect(flat.className).not.toMatch(/success/);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("ріст — стрілка вгору, плюс і зелений, коли більше = краще", () => {
    render(<DeltaChip cur={6} prev={4} />);
    const chip = screen.getByTestId("delta-chip");
    expect(chip).toHaveTextContent("+50%");
    expect(chip.className).toMatch(/success/);
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("ріст витрат — та сама стрілка вгору, але червоний", () => {
    render(<DeltaChip cur={6} prev={4} higherIsBetter={false} />);
    const chip = screen.getByTestId("delta-chip");
    expect(chip).toHaveTextContent("+50%");
    expect(chip.className).toMatch(/danger/);
  });

  it("спад — без плюса, відсоток зі знаком мінус", () => {
    render(<DeltaChip cur={2} prev={4} />);
    expect(screen.getByTestId("delta-chip")).toHaveTextContent("-50%");
  });

  // Р4 (канон finyk): коли відсоток не має бази, викликач просить абсолютну
  // дельту через `absoluteUnit`; решта станів чипа та сама.
  describe("absoluteUnit", () => {
    const text = () =>
      (screen.getByTestId("delta-chip").textContent ?? "").replace(
        /[\s\u00a0\u202f]/g,
        " ",
      );

    it("ріст — «+480 ₴» замість відсотка, колір і стрілка за higherIsBetter", () => {
      render(
        <DeltaChip
          cur={500}
          prev={20}
          higherIsBetter={false}
          absoluteUnit="₴"
        />,
      );
      const chip = screen.getByTestId("delta-chip");
      expect(text()).toBe("+480 ₴");
      expect(chip).not.toHaveTextContent("%");
      expect(chip.className).toMatch(/danger/);
      expect(chip.querySelector("svg")).not.toBeNull();
    });

    it("спад — знак мінус і розділювач тисяч", () => {
      render(<DeltaChip cur={1000} prev={13500} absoluteUnit="₴" />);
      expect(text()).toBe("\u221212 500 ₴");
    });

    it("нуль і ріст від нуля лишаються тими самими станами, що й без одиниці", () => {
      const { rerender } = render(
        <DeltaChip cur={3} prev={3} absoluteUnit="₴" />,
      );
      expect(screen.getByTestId("delta-chip-flat")).toHaveTextContent(
        "без змін",
      );
      rerender(<DeltaChip cur={5} prev={0} absoluteUnit="₴" />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });
});
