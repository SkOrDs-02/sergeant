// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { flatMatch } from "@shared/testing/numberText";
import { cleanup, render, screen } from "@testing-library/react";
import { LoadCalculator } from "./LoadCalculator";

afterEach(cleanup);

describe("LoadCalculator", () => {
  it("renders the three training zones and the 1RM header", () => {
    render(<LoadCalculator oneRM={100} />);
    expect(screen.getByText("Калькулятор навантаження")).toBeInTheDocument();
    expect(screen.getByText(flatMatch(/1RM = 100 кг/))).toBeInTheDocument();
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

  // QA 2026-08-23: калькулятор друкував «92.5 / 87.5» англійською крапкою
  // поруч із «102,5 кг» на тій самій сторінці.
  it("prints fractional loads with the Ukrainian decimal comma", () => {
    render(<LoadCalculator oneRM={97.5} />);
    expect(screen.getByText("92,5")).toBeInTheDocument();
    expect(screen.queryByText("92.5")).toBeNull();
  });

  // Раніше веб малював зони з прочерками на нульовому 1RM, а канонічний
  // `buildLoadCalculatorZones` ховає картку (`oneRM <= 0` → []).
  it("renders nothing when 1RM is 0, matching the domain contract", () => {
    const { container } = render(<LoadCalculator oneRM={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the header as a reduced reference instead of 1RM when reduced", () => {
    render(<LoadCalculator oneRM={90} reduced />);
    expect(screen.getByText(flatMatch(/орієнтир = 90 кг/))).toBeInTheDocument();
    expect(screen.queryByText(flatMatch(/1RM =/))).not.toBeInTheDocument();
    // The zones still render — `reduced` only changes the caption, the
    // calculator keeps working off the (already-reduced) `oneRM` it got.
    expect(screen.getByText("Сила")).toBeInTheDocument();
  });
});
