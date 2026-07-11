// @vitest-environment jsdom
/**
 * Branch coverage for FlowRow — amount masking, null amounts, and tone colours.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { THEME_HEX } from "@shared/lib/ui/themeHex";
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
  it("renders formatted amount when showAmount is true", () => {
    render(<FlowRow flow={mkFlow({ amount: 1500 })} showAmount />);
    expect(screen.getByText(/−1 500 ₴/)).toBeInTheDocument();
  });

  it("masks amount as bullets when showAmount is false", () => {
    render(<FlowRow flow={mkFlow()} showAmount={false} />);
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(screen.queryByText(/₴/)).toBeNull();
  });

  it("shows sign with question mark when amount is null", () => {
    render(<FlowRow flow={mkFlow({ amount: null })} />);
    expect(screen.getByText(/−\? ₴/)).toBeInTheDocument();
  });

  it("applies success tone when flow.color matches THEME_HEX.success", () => {
    const { container } = render(
      <FlowRow flow={mkFlow({ color: THEME_HEX.success, sign: "+" })} />,
    );
    expect(container.querySelector(".text-success-strong")).not.toBeNull();
  });

  it("applies danger tone for non-success flows", () => {
    const { container } = render(<FlowRow flow={mkFlow()} />);
    expect(container.querySelector(".text-danger-strong")).not.toBeNull();
  });

  it("renders title and hint text", () => {
    render(<FlowRow flow={mkFlow({ title: "Оренда", hint: "1 числа" })} />);
    expect(screen.getByText("Оренда")).toBeInTheDocument();
    expect(screen.getByText("1 числа")).toBeInTheDocument();
  });
});
