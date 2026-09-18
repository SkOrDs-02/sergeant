// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PrBadge } from "./PrBadge";

afterEach(cleanup);

describe("PrBadge", () => {
  it("renders nothing when there is no PR", () => {
    const { container } = render(<PrBadge pr={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the PR is stale (> 14 days)", () => {
    const { container } = render(
      <PrBadge
        pr={{ exerciseName: "Жим лежачи", weightKg: 100, daysAgo: 20 }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a compact pill for a fresh integer-weight PR", () => {
    render(
      <PrBadge
        pr={{ exerciseName: "Жим лежачи", weightKg: 100, daysAgo: 2 }}
      />,
    );
    // First word of the exercise name is shown, with the rounded weight.
    expect(screen.getByText(/PR · Жим · 100/)).toBeInTheDocument();
  });

  it("keeps a meaningful decimal for non-integer weight", () => {
    render(
      <PrBadge
        pr={{ exerciseName: "Присідання", weightKg: 82.5, daysAgo: 0 }}
      />,
    );
    expect(screen.getByText(/82\.5/)).toBeInTheDocument();
  });

  it("truncates a long single-token exercise name", () => {
    render(
      <PrBadge
        pr={{
          exerciseName: "Супердовганазвавправи",
          weightKg: 50,
          daysAgo: 1,
        }}
      />,
    );
    expect(screen.getByText(/…/)).toBeInTheDocument();
  });
});
