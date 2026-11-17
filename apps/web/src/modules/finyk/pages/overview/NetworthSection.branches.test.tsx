// @vitest-environment jsdom
/**
 * Branch coverage for NetworthSection — chart vs nothing.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NetworthSection } from "./NetworthSection";

vi.mock("../../components/charts/lazy", () => ({
  NetworthChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="networth-chart">points {data.length}</div>
  ),
}));

afterEach(() => cleanup());

describe("NetworthSection (branches)", () => {
  it("renders nothing when fewer than two history points", () => {
    const { container } = render(
      <NetworthSection
        networthHistory={[{ month: "2026-01", networth: 100 }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for zero history", () => {
    const { container } = render(<NetworthSection networthHistory={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders chart card when history has two or more points", () => {
    render(
      <NetworthSection
        networthHistory={[
          { month: "2026-01", networth: 100 },
          { month: "2026-02", networth: 200 },
        ]}
      />,
    );
    expect(screen.getByText("Динаміка капіталу")).toBeInTheDocument();
    expect(screen.getByText("2 міс.")).toBeInTheDocument();
    expect(screen.getByTestId("networth-chart")).toHaveTextContent("points 2");
  });

  it("shows month count matching history length", () => {
    render(
      <NetworthSection
        networthHistory={[
          { month: "2026-01", networth: 100 },
          { month: "2026-02", networth: 150 },
          { month: "2026-03", networth: 120 },
        ]}
      />,
    );
    expect(screen.getByText("3 міс.")).toBeInTheDocument();
  });
});
