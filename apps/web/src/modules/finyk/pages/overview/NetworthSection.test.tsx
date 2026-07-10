// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworthSection } from "./NetworthSection";

vi.mock("../../components/charts/lazy", () => ({
  NetworthChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="networth-chart">points:{data.length}</div>
  ),
}));

describe("NetworthSection", () => {
  it("shows empty state when fewer than two history points", () => {
    render(
      <NetworthSection
        networthHistory={[{ month: "2026-05", networth: 100 }]}
      />,
    );
    expect(screen.getByText("Поки що мало знімків")).toBeInTheDocument();
    expect(
      screen.getByText("Графік нетворсу з'явиться після кількох змін балансу."),
    ).toBeInTheDocument();
  });

  it("renders chart when history has two or more points", () => {
    render(
      <NetworthSection
        networthHistory={[
          { month: "2026-04", networth: 100 },
          { month: "2026-05", networth: 200 },
        ]}
      />,
    );
    expect(screen.getByText("Динаміка нетворсу")).toBeInTheDocument();
    expect(screen.getByText("2 міс.")).toBeInTheDocument();
    expect(screen.getByTestId("networth-chart")).toHaveTextContent("points:2");
  });
});
