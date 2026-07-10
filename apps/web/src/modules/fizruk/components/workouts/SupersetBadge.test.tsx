// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SupersetBadge } from "./SupersetBadge";

afterEach(cleanup);

describe("SupersetBadge", () => {
  it("renders the superset label", () => {
    render(<SupersetBadge type="superset" />);
    expect(screen.getByText("Суперсет")).toBeInTheDocument();
  });

  it("renders the circuit label", () => {
    render(<SupersetBadge type="circuit" />);
    expect(screen.getByText("Коло")).toBeInTheDocument();
  });
});
