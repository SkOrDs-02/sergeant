// @vitest-environment jsdom
/**
 * Branch coverage for FlowRow — amount masking, null amounts, and tone colours.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FlowRow, type FlowItem } from "./FlowRow";

afterEach(() => cleanup());

function mkFlow(overrides: Partial<FlowItem> = {}): FlowItem {
  return {
    title: "Netflix",
    hint: "щомісяця",
    amount: 199,
    sign: "−",
    currency: "₴",
    ...overrides,
  };
}

describe("FlowRow (branches)", () => {
  /**
   * `Money` розкладає суму на вузли, тож матчер — по `textContent`.
   * Пробіли явними escape-послідовностями: `\u00a0` у розрядах,
   * `\u202f` перед символом. Мінус — U+2212, і це не косметика: продюсер
   * (`useOverviewData`) віддає дефіс, а рядок у стовпчику мусить бути
   * однакової ширини з рештою.
   */
  it("renders formatted amount when showAmount is true", () => {
    const { container } = render(
      <FlowRow flow={mkFlow({ amount: 1500 })} showAmount />,
    );
    expect(container.textContent).toMatch(/−1\u00a0500\u202f₴/);
  });

  it("нормалізує дефіс продюсера в справжній мінус", () => {
    const { container } = render(
      <FlowRow flow={mkFlow({ amount: 1500, sign: "-" })} showAmount />,
    );
    expect(container.textContent).toMatch(/−1\u00a0500/);
    expect(container.textContent).not.toMatch(/-1/);
  });

  it("masks amount as bullets when showAmount is false", () => {
    render(<FlowRow flow={mkFlow()} showAmount={false} />);
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(screen.queryByText(/₴/)).toBeNull();
  });

  it("shows sign with question mark when amount is null", () => {
    const { container } = render(<FlowRow flow={mkFlow({ amount: null })} />);
    expect(container.textContent).toMatch(/−\?\u202f₴/);
  });

  // Тон бере напрямок зі `sign`, а не з хекса (2026-08-07). Раніше тут
  // передавали `color: THEME_HEX.success` — тобто тест ішов тим самим
  // шляхом, що й баг: підтверджував, що семантику можна відновити зі
  // значення кольору.
  it("надходження — зелений тон", () => {
    const { container } = render(<FlowRow flow={mkFlow({ sign: "+" })} />);
    expect(container.querySelector(".text-success-strong")).not.toBeNull();
    expect(container.querySelector(".text-danger-strong")).toBeNull();
  });

  it("відплив — червоний тон", () => {
    const { container } = render(<FlowRow flow={mkFlow({ sign: "-" })} />);
    expect(container.querySelector(".text-danger-strong")).not.toBeNull();
    expect(container.querySelector(".text-success-strong")).toBeNull();
  });

  it("renders title and hint text", () => {
    render(<FlowRow flow={mkFlow({ title: "Оренда", hint: "1 числа" })} />);
    expect(screen.getByText("Оренда")).toBeInTheDocument();
    expect(screen.getByText("1 числа")).toBeInTheDocument();
  });
});
