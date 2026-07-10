// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { THEME_HEX } from "@shared/lib/ui/themeHex";
import { FlowRow } from "./FlowRow";

describe("FlowRow", () => {
  const baseFlow = {
    title: "Netflix",
    hint: "завтра",
    amount: 29900,
    sign: "-",
    currency: "₴",
    color: THEME_HEX.danger,
  };

  it("formats expense amount with locale grouping", () => {
    render(<FlowRow flow={baseFlow} showAmount />);
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("завтра")).toBeInTheDocument();
    expect(screen.getByText(/-29\s?900 ₴/)).toBeInTheDocument();
  });

  it("uses success tone for green flows", () => {
    const { container } = render(
      <FlowRow
        flow={{ ...baseFlow, color: THEME_HEX.success, sign: "+" }}
        showAmount
      />,
    );
    expect(container.querySelector(".text-success-strong")).not.toBeNull();
  });

  it("shows unknown amount placeholder when amount is null", () => {
    render(
      <FlowRow flow={{ ...baseFlow, amount: null, sign: "-" }} showAmount />,
    );
    expect(screen.getByText(/-\? ₴/)).toBeInTheDocument();
  });

  it("masks amount when showAmount=false", () => {
    render(<FlowRow flow={baseFlow} showAmount={false} />);
    expect(screen.getByText("••••")).toBeInTheDocument();
  });
});
