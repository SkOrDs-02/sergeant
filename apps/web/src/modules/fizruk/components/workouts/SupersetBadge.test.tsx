// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupersetBadge } from "./SupersetBadge";

describe("SupersetBadge", () => {
  it("renders superset label for superset type", () => {
    render(<SupersetBadge type="superset" />);
    expect(screen.getByText("Суперсет")).toBeInTheDocument();
  });

  it("renders circuit label for circuit type", () => {
    render(<SupersetBadge type="circuit" />);
    expect(screen.getByText("Коло")).toBeInTheDocument();
  });
});
