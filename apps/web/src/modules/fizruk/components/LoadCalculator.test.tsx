// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LoadCalculator } from "./LoadCalculator";

afterEach(cleanup);

describe("LoadCalculator", () => {
  it("renders the three training zones and the 1RM header", () => {
    render(<LoadCalculator oneRM={100} />);
    expect(screen.getByText("Калькулятор навантаження")).toBeInTheDocument();
    expect(screen.getByText(/1RM = 100 кг/)).toBeInTheDocument();
    expect(screen.getByText("Сила")).toBeInTheDocument();
    expect(screen.getByText("Гіпертрофія")).toBeInTheDocument();
    expect(screen.getByText("Витривалість")).toBeInTheDocument();
  });

  it("computes 2.5kg-rounded loads per percentage", () => {
    render(<LoadCalculator oneRM={100} />);
    // 95% of 100 = 95 → rounds to 95
    expect(screen.getByText("95")).toBeInTheDocument();
    // percentage labels present
    expect(screen.getAllByText("95%").length).toBeGreaterThan(0);
  });

  it("renders dashes for zero loads when 1RM is 0", () => {
    render(<LoadCalculator oneRM={0} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
